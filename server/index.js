'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const fs      = require('fs');

const db = require('./database');

const app  = express();
const PORT         = process.env.PORT        || 3001;
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3002')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
const JWT_SECRET   = process.env.JWT_SECRET  || 'zzc_jwt_secret_change_in_production';
const DELIVERY_FEE = 200; // cents

// ── Static file serving for uploaded images ───────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Global Audit Middleware ───────────────────────────────────────────────────
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.staff && !req.path.includes('/audit')) {
      try {
        const action = req.method === 'POST' ? 'CREATE' : (req.method === 'DELETE' ? 'DELETE' : 'UPDATE');
        
        // Path logic: /api/inventory/123 -> entity: inventory
        const pathParts = req.path.replace(/^\/api\//, '').replace(/^\//, '').split('/');
        const entity = pathParts[0] || 'system';
        
        let entityId = null;
        if (pathParts[1] && !isNaN(parseInt(pathParts[1]))) {
          entityId = parseInt(pathParts[1]);
        } else if (pathParts[1] && pathParts[1].startsWith('ZZC-')) {
          entityId = pathParts[1];
        }

        let detailsStr = '';
        try {
          const bodyObj = req.body || {};
          const safeBody = { ...bodyObj };
          if (safeBody.image) safeBody.image = '[IMAGE_DATA_HIDDEN]';
          if (safeBody.password) safeBody.password = '[HIDDEN]';
          detailsStr = JSON.stringify(safeBody);
          
          if (!entityId && typeof body === 'string') {
            const resData = JSON.parse(body);
            if (resData.id) entityId = resData.id;
            if (resData.order && resData.order.id) entityId = resData.order.id;
          }
        } catch (e) {
           detailsStr = JSON.stringify(req.body);
        }

        // don't log mere fetches or logins
        if (entity !== 'login' && entity !== 'auth') {
           db.addAuditLog({
             staffId: req.staff.id,
             staffName: req.staff.name || req.staff.email || 'Staff',
             action,
             entity,
             entityId: entityId ? String(entityId) : null,
             details: detailsStr,
           });
        }
      } catch (err) {
        console.error("Audit log error:", err);
      }
    }
    originalSend.call(this, body);
  };
  next();
});

// ── Multer (image uploads) ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

// ── Auth helpers ──────────────────────────────────────────────────────────────
function signToken(staff) {
  return jwt.sign(
    { id: staff.id, email: staff.email, role: staff.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/** Middleware: require a valid JWT. Attaches req.staff */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  try {
    req.staff = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

/** Middleware: require owner role */
function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.staff.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Owner access required.' });
    }
    next();
  });
}

// ── Order helpers ─────────────────────────────────────────────────────────────
function generateOrderId() {
  const ts  = Date.now().toString().slice(-5);
  const rnd = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `ZZC-${ts}-${rnd}`;
}

// Parse a price value — accepts cents integer or legacy "$" string, returns cents
function toCents(val) {
  if (typeof val === 'number') {
    // If > 50 it's already cents (cheapest item is 60¢); else treat as dollars
    return val > 50 ? val : Math.round(val * 100);
  }
  const str = String(val).replace('$', '');
  const f   = parseFloat(str);
  // Heuristic: if < 100 and has decimal → dollars
  return f < 100 ? Math.round(f * 100) : Math.round(f);
}

// ════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  try {
    const orders = db.loadOrders({ limit: 1 });
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.json({ status: 'degraded', timestamp: new Date().toISOString() });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════════════════════

/** POST /api/auth/login */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required.' });
  }

  const staff = db.getStaffByEmail(email.toLowerCase().trim());
  if (!staff || !bcrypt.compareSync(password, staff.password)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }
  if (!staff.isActive) {
    return res.status(403).json({ success: false, message: 'Account is deactivated.' });
  }

  const token = signToken(staff);
  const { password: _pw, ...safeStaff } = staff;
  res.json({ success: true, token, staff: safeStaff });
});

/** GET /api/auth/me */
app.get('/api/auth/me', requireAuth, (req, res) => {
  const staff = db.getStaffById(req.staff.id);
  if (!staff) return res.status(404).json({ success: false, message: 'Staff not found.' });
  res.json({ success: true, staff });
});

/** POST /api/auth/pin-login — Cashier PIN login */
app.post('/api/auth/pin-login', (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, message: 'PIN must be 4 digits.' });
  }
  const staff = db.getStaffByPin(pin);
  if (!staff) return res.status(401).json({ success: false, message: 'Invalid PIN.' });
  if (!staff.isActive) return res.status(403).json({ success: false, message: 'Account deactivated.' });
  const token = signToken(staff);
  const { password: _pw, ...safeStaff } = staff;
  res.json({ success: true, token, staff: safeStaff });
});

/** PATCH /api/auth/set-pin — Set/change own PIN (auth) */
app.patch('/api/auth/set-pin', requireAuth, (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, message: 'PIN must be 4 digits.' });
  }
  // Ensure PIN is unique
  const existing = db.getStaffByPin(pin);
  if (existing && existing.id !== req.staff.id) {
    return res.status(400).json({ success: false, message: 'PIN already in use by another staff member.' });
  }
  db.updateStaff(req.staff.id, { pin });
  res.json({ success: true, message: 'PIN updated successfully.' });
});

// ════════════════════════════════════════════════════════════════════════════
//  CATEGORIES
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/categories  (public) */
app.get('/api/categories', (_req, res) => {
  res.json({ success: true, categories: db.getCategories() });
});

/** POST /api/categories  (auth) */
app.post('/api/categories', requireAuth, (req, res) => {
  const { name, id, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Category name required.' });
  try {
    const cat = db.createCategory({ name, id, sortOrder });
    res.status(201).json({ success: true, category: cat });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** DELETE /api/categories/:id  (auth) */
app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const ok = db.deleteCategory(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'Category not found.' });
  res.json({ success: true, message: 'Category deleted.' });
});

// ════════════════════════════════════════════════════════════════════════════
//  MENU ITEMS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/products  (public) — used by the storefront */
app.get('/api/products', (req, res) => {
  const { category } = req.query;
  const items = db.getMenuItems(category ? { categoryId: category } : {});
  res.json({ success: true, items });
});

/** POST /api/menu/upload  — image upload (auth) */
app.post('/api/menu/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No image provided.' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url });
});

/** POST /api/menu  (auth) */
app.post('/api/menu', requireAuth, (req, res) => {
  const { title, description, price, categoryId, image, isAvailable } = req.body;
  if (!title || price === undefined || !categoryId) {
    return res.status(400).json({ success: false, message: 'title, price, and categoryId are required.' });
  }
  const item = db.createMenuItem({
    title, description, price: toCents(price),
    categoryId, image, isAvailable,
  });
  res.status(201).json({ success: true, item });
});

/** PATCH /api/menu/:id  (auth) */
app.patch('/api/menu/:id', requireAuth, (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const data = { ...req.body };
  if (data.price !== undefined) data.price = toCents(data.price);

  const item = db.updateMenuItem(id, data);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
  res.json({ success: true, item });
});

/** DELETE /api/menu/:id  (auth) */
app.delete('/api/menu/:id', requireAuth, (req, res) => {
  const ok = db.deleteMenuItem(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Item not found.' });
  res.json({ success: true, message: 'Item deleted.' });
});

// ════════════════════════════════════════════════════════════════════════════
//  STAFF
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/staff  (owner) */
app.get('/api/staff', requireOwner, (_req, res) => {
  res.json({ success: true, staff: db.getAllStaff() });
});

/** POST /api/staff  (owner) */
app.post('/api/staff', requireOwner, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email and password are required.' });
  }
  try {
    const member = db.createStaff({ name, email: email.toLowerCase().trim(), password, role });
    res.status(201).json({ success: true, staff: member });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** PATCH /api/staff/:id  (owner) */
app.patch('/api/staff/:id', requireOwner, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = db.updateStaff(id, req.body);
  if (!updated) return res.status(404).json({ success: false, message: 'Staff not found.' });
  res.json({ success: true, staff: updated });
});

// ════════════════════════════════════════════════════════════════════════════
//  ORDERS  (storefront + admin)
// ════════════════════════════════════════════════════════════════════════════

/** POST /api/orders  — place an order (public) */
app.post('/api/orders', (req, res) => {
  const { customer, orderType, items, paymentMethod, notes, totalAmount, discountAmount, taxAmount, serviceAmount } = req.body;

  if (!items?.length) {
    return res.status(400).json({ success: false, message: 'Cart is empty.' });
  }
  if (orderType !== 'walk-in' && !customer?.phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }
  if (orderType === 'dine-in' && !customer?.tableNumber) {
    return res.status(400).json({ success: false, message: 'Table number required for dine-in.' });
  }
  if (orderType === 'delivery' && !customer?.address) {
    return res.status(400).json({ success: false, message: 'Delivery address required.' });
  }

  // Set default name for walk-in if empty
  if (orderType === 'walk-in' && !customer?.fullName) {
    customer.fullName = 'Walk-in Customer';
  }

  // ── Server-side price recalculation ──────────────────────────────────────
  let calculatedSubtotal = 0; // cents
  const verifiedItems = [];

  for (const item of items) {
    const dbItem = db.getMenuItemById(item.id);
    if (!dbItem) {
      return res.status(400).json({ success: false, message: `Unknown item id: ${item.id}` });
    }
    if (!dbItem.isAvailable) {
      return res.status(400).json({ success: false, message: `"${dbItem.title}" is currently unavailable.` });
    }

    const officialCents = dbItem.price; // always integer cents from DB
    const clientCents   = toCents(item.price);

    if (Math.abs(officialCents - clientCents) > 1) { // allow ±1¢ rounding
      return res.status(400).json({
        success: false,
        message: `Price mismatch for "${dbItem.title}". Expected ${officialCents}¢, got ${clientCents}¢.`,
      });
    }

    calculatedSubtotal += officialCents * item.quantity;
    verifiedItems.push({
      id: dbItem.id, title: dbItem.title,
      price: officialCents, quantity: item.quantity,
    });
  }

  const deliveryFee        = orderType === 'delivery' ? DELIVERY_FEE : 0;
  const discountCents      = toCents(discountAmount || 0);
  const taxCents           = toCents(taxAmount || 0);
  const serviceCents       = toCents(serviceAmount || 0);

  // Server-side total: (subtotal - discount) + delivery + tax + service
  const afterDiscount      = Math.max(0, calculatedSubtotal - discountCents);
  const calculatedTotal    = afterDiscount + deliveryFee + taxCents + serviceCents;
  const clientTotal        = toCents(totalAmount);

  if (isNaN(clientTotal) || Math.abs(calculatedTotal - clientTotal) > 5) {
    return res.status(400).json({
      success: false,
      message: `Total mismatch. Expected ${calculatedTotal}¢, got ${clientTotal}¢.`,
    });
  }

  const order = {
    id: generateOrderId(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    customer,
    orderType,
    items: verifiedItems,
    paymentMethod,
    notes: notes || '',
    totalAmount: calculatedTotal,  // integer cents
  };

  try {
    db.saveOrder(order);
  } catch (err) {
    console.error('DB error saving order:', err);
    return res.status(500).json({ success: false, message: 'Failed to save order.' });
  }

  console.log(`\n✅ Order ${order.id} | ${order.orderType} | ${(calculatedTotal/100).toFixed(2)} USD`);
  return res.status(201).json({
    success: true,
    message: 'Order placed successfully!',
    order: {
      id: order.id,
      status: order.status,
      estimatedTime: orderType === 'delivery' ? '30–45 min' : '10–15 min',
    },
  });
});

/** GET /api/orders/kitchen  (auth) — Returns all active orders for KDS */
app.get('/api/orders/kitchen', requireAuth, (req, res) => {
  try {
    const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready'];
    const allActive = [];
    for (const status of activeStatuses) {
      const orders = db.loadOrders({ status });
      allActive.push(...orders);
    }

    // Sort by createdAt ascending (oldest first)
    allActive.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Also fetch today's completed/served for performance stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const completedToday = db.loadOrders({ status: 'delivered' }).filter(o =>
      new Date(o.createdAt) >= todayStart
    );
    const servedToday = db.loadOrders({ status: 'served' }).filter(o =>
      new Date(o.createdAt) >= todayStart
    ).concat(completedToday);

    // Calc avg prep time (minutes) from orders that have prepStartedAt -> readyAt
    // Since we don't have those timestamps, approximate from createdAt
    const delayed = allActive.filter(o => {
      const mins = (Date.now() - new Date(o.createdAt).getTime()) / 60000;
      return mins > 15;
    });

    res.json({
      success: true,
      orders: allActive,
      stats: {
        pending: allActive.filter(o => o.status === 'pending').length,
        preparing: allActive.filter(o => o.status === 'preparing').length,
        ready: allActive.filter(o => o.status === 'ready').length,
        completedToday: servedToday.length,
        delayed: delayed.length,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** GET /api/orders  (auth) */
app.get('/api/orders', requireAuth, (req, res) => {
  const { status, limit, offset } = req.query;
  const orders = db.loadOrders({
    status,
    limit:  limit  ? parseInt(limit,  10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });
  res.json({ success: true, total: orders.length, orders });
});

/** GET /api/orders/:id  (public — customers check their own order) */
app.get('/api/orders/:id', (req, res) => {
  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
  res.json({ success: true, order });
});

/** PATCH /api/orders/:id/status  (auth) */
app.patch('/api/orders/:id/status', requireAuth, (req, res) => {
  const VALID = ['pending','confirmed','preparing','ready','served','delivered','cancelled'];
  const { status } = req.body;
  if (!VALID.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  const ok = db.updateOrderStatus(req.params.id, status);
  if (!ok) return res.status(404).json({ success: false, message: 'Order not found.' });
  res.json({ success: true, order: db.getOrderById(req.params.id) });
});

/** DELETE /api/orders  (owner) */
app.delete('/api/orders', requireOwner, (_req, res) => {
  db.clearAllOrders();
  res.json({ success: true, message: 'All orders cleared.' });
});

// ════════════════════════════════════════════════════════════════════════════
//  ANALYTICS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/analytics/today  (auth) */
app.get('/api/analytics/today', requireAuth, (_req, res) => {
  const stats = db.getTodayStats();
  res.json({ success: true, stats });
});

/** GET /api/analytics/charts  (auth) */
app.get('/api/analytics/charts', requireAuth, (req, res) => {
  const days = parseInt(req.query.days || '7', 10);
  res.json({
    success: true,
    salesTrend: db.getSalesTrend(days),
    topItems:   db.getTopItems(10),
    hourly:     db.getHourlySales(),
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/settings/cafe  (public — storefront needs cafe name) */
app.get('/api/settings/cafe', (_req, res) => {
  res.json({ success: true, cafe: db.getSetting('cafe') || {} });
});

/** PATCH /api/settings/cafe  (owner) */
app.patch('/api/settings/cafe', requireOwner, (req, res) => {
  const current = db.getSetting('cafe') || {};
  const updated = { ...current, ...req.body };
  db.setSetting('cafe', updated);
  res.json({ success: true, cafe: updated });
});

/** GET /api/settings  (auth) */
app.get('/api/settings', requireAuth, (_req, res) => {
  res.json({ success: true, settings: db.getAllSettings() });
});

/** PATCH /api/settings  (owner) */
app.patch('/api/settings', requireOwner, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ success: false, message: 'Setting key required.' });
  db.setSetting(key, value);
  res.json({ success: true, message: 'Setting updated.' });
});


// ════════════════════════════════════════════════════════════════════════════
//  MODIFIERS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/modifiers  (public) */
app.get('/api/modifiers', (_req, res) => {
  res.json({ success: true, modifiers: db.getAllModifiers() });
});

/** GET /api/modifiers/product/:id  (public) */
app.get('/api/modifiers/product/:id', (req, res) => {
  const mods = db.getProductModifiers(parseInt(req.params.id, 10));
  res.json({ success: true, modifiers: mods });
});

/** POST /api/modifiers  (auth) */
app.post('/api/modifiers', requireAuth, (req, res) => {
  const { name, required, multiSelect } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Modifier name required.' });
  const mod = db.createModifier({ name, required: !!required, multiSelect: !!multiSelect });
  res.status(201).json({ success: true, modifier: mod });
});

/** POST /api/modifiers/:id/options  (auth) */
app.post('/api/modifiers/:id/options', requireAuth, (req, res) => {
  const { label, priceAdjustment } = req.body;
  if (!label) return res.status(400).json({ success: false, message: 'Option label required.' });
  const opt = db.addModifierOption(parseInt(req.params.id, 10), label, priceAdjustment || 0);
  res.status(201).json({ success: true, option: opt });
});

/** DELETE /api/modifiers/:id  (auth) */
app.delete('/api/modifiers/:id', requireAuth, (req, res) => {
  const ok = db.deleteModifier(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Modifier not found.' });
  res.json({ success: true });
});

/** POST /api/menu/:id/modifiers  — link modifier to product (auth) */
app.post('/api/menu/:id/modifiers', requireAuth, (req, res) => {
  const { modifierId } = req.body;
  db.linkModifierToProduct(parseInt(req.params.id, 10), modifierId);
  res.json({ success: true });
});

/** DELETE /api/menu/:id/modifiers/:mid  (auth) */
app.delete('/api/menu/:id/modifiers/:mid', requireAuth, (req, res) => {
  db.unlinkModifierFromProduct(parseInt(req.params.id, 10), parseInt(req.params.mid, 10));
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  TABLES
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/tables  (public - POS needs to read tables) */
app.get('/api/tables', (_req, res) => {
  res.json({ success: true, tables: db.getAllTables() });
});

/** POST /api/tables  (owner) */
app.post('/api/tables', requireOwner, (req, res) => {
  const { number, capacity } = req.body;
  if (!number) return res.status(400).json({ success: false, message: 'Table number required.' });
  try {
    const table = db.createCafeTable({ number, capacity });
    res.status(201).json({ success: true, table });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** PATCH /api/tables/:id/status  (auth) */
app.patch('/api/tables/:id/status', requireAuth, (req, res) => {
  const VALID = ['available', 'occupied', 'reserved', 'cleaning'];
  const { status } = req.body;
  if (!VALID.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
  const ok = db.updateTableStatus(parseInt(req.params.id, 10), status);
  if (!ok) return res.status(404).json({ success: false, message: 'Table not found.' });
  res.json({ success: true });
});

/** PATCH /api/tables/:id  (owner) — update table number, capacity, status */
app.patch('/api/tables/:id', requireOwner, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { number, capacity, status } = req.body;
  try {
    const fields = [];
    const values = [];
    if (number !== undefined)   { fields.push('number = ?');   values.push(parseInt(number)); }
    if (capacity !== undefined) { fields.push('capacity = ?'); values.push(parseInt(capacity)); }
    if (status !== undefined)   { fields.push('status = ?');   values.push(status); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'Nothing to update.' });
    values.push(id);
    const info = db.getDb().prepare(`UPDATE cafe_tables SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    if (info.changes === 0) return res.status(404).json({ success: false, message: 'Table not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  CUSTOMERS & LOYALTY
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/customers?q=  (auth) */
app.get('/api/customers', requireAuth, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: true, customers: [] });
  res.json({ success: true, customers: db.searchCustomers(q) });
});

/** GET /api/customers/:phone  (public — POS lookup) */
app.get('/api/customers/:phone', (req, res) => {
  const info = db.getLoyaltyByPhone(req.params.phone);
  if (!info) return res.status(404).json({ success: false, message: 'Customer not found.' });
  res.json({ success: true, customer: info });
});

/** POST /api/customers  (public — POS create walk-in customer) */
app.post('/api/customers', (req, res) => {
  const { name, phone, email } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone number required.' });
  const cust = db.createCustomer({ name, phone, email });
  res.status(201).json({ success: true, customer: cust });
});

/** POST /api/loyalty/redeem  (public — POS) */
app.post('/api/loyalty/redeem', (req, res) => {
  const { phone, points } = req.body;
  if (!phone || !points) return res.status(400).json({ success: false, message: 'phone and points required.' });
  try {
    const discountCents = db.redeemLoyaltyPoints(phone, parseInt(points, 10));
    res.json({ success: true, discountCents });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** GET /api/products/barcode/:code  (public — barcode scan) */
app.get('/api/products/barcode/:code', (req, res) => {
  const item = db.getMenuItemByBarcode(req.params.code);
  if (!item) return res.status(404).json({ success: false, message: 'Product not found.' });
  res.json({ success: true, item });
});

// ════════════════════════════════════════════════════════════════════════════
//  INVENTORY
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/inventory  (auth) */
app.get('/api/inventory', requireAuth, (_req, res) => {
  res.json({ success: true, inventory: db.getInventory() });
});

/** PATCH /api/inventory/:productId  (auth) — set or adjust stock */
app.patch('/api/inventory/:productId', requireAuth, (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const { type, qty, reason, unit, lowStockThreshold } = req.body;
  if (type && qty !== undefined) {
    const item = db.adjustStock(productId, type, qty, reason, req.staff.id);
    db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'UPDATE', entity: 'inventory', entityId: String(productId), details: { type, qty, reason } });
    return res.json({ success: true, item });
  }
  // Otherwise upsert
  const item = db.upsertInventory(productId, qty || 0, unit, lowStockThreshold);
  res.json({ success: true, item });
});

/** GET /api/inventory/movements  (auth) */
app.get('/api/inventory/movements', requireAuth, (req, res) => {
  const { productId, limit } = req.query;
  res.json({ success: true, movements: db.getStockMovements(productId ? parseInt(productId, 10) : null, limit ? parseInt(limit, 10) : 100) });
});

// ════════════════════════════════════════════════════════════════════════════
//  SUPPLIERS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/suppliers  (auth) */
app.get('/api/suppliers', requireAuth, (_req, res) => {
  res.json({ success: true, suppliers: db.getAllSuppliers() });
});

/** POST /api/suppliers  (auth) */
app.post('/api/suppliers', requireAuth, (req, res) => {
  const { name, phone, email, address, notes } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Supplier name required.' });
  const supplier = db.createSupplier({ name, phone, email, address, notes });
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'CREATE', entity: 'supplier', entityId: String(supplier.id), details: { name } });
  res.status(201).json({ success: true, supplier });
});

/** PATCH /api/suppliers/:id  (auth) */
app.patch('/api/suppliers/:id', requireAuth, (req, res) => {
  const supplier = db.updateSupplier(parseInt(req.params.id, 10), req.body);
  if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });
  res.json({ success: true, supplier });
});

/** DELETE /api/suppliers/:id  (owner) */
app.delete('/api/suppliers/:id', requireOwner, (req, res) => {
  const ok = db.deleteSupplier(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Supplier not found.' });
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'DELETE', entity: 'supplier', entityId: req.params.id });
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  PURCHASE ORDERS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/purchase-orders  (auth) */
app.get('/api/purchase-orders', requireAuth, (req, res) => {
  const { supplierId } = req.query;
  res.json({ success: true, orders: db.getAllPurchaseOrders(supplierId ? parseInt(supplierId, 10) : null) });
});

/** POST /api/purchase-orders  (auth) */
app.post('/api/purchase-orders', requireAuth, (req, res) => {
  const { supplierId, items, totalAmount, notes } = req.body;
  if (!supplierId) return res.status(400).json({ success: false, message: 'supplierId required.' });
  const order = db.createPurchaseOrder({ supplierId, items, totalAmount, notes });
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'CREATE', entity: 'purchase_order', entityId: String(order.id) });
  res.status(201).json({ success: true, order });
});

/** POST /api/purchase-orders/:id/receive  (auth) — marks received + adjusts stock */
app.post('/api/purchase-orders/:id/receive', requireAuth, (req, res) => {
  const order = db.receivePurchaseOrder(parseInt(req.params.id, 10), req.staff.id);
  if (!order) return res.status(400).json({ success: false, message: 'Order not found or already received.' });
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'UPDATE', entity: 'purchase_order', entityId: req.params.id, details: { status: 'received' } });
  res.json({ success: true, order });
});

/** POST /api/purchase-orders/:id/cancel  (auth) */
app.post('/api/purchase-orders/:id/cancel', requireAuth, (req, res) => {
  const ok = db.cancelPurchaseOrder(parseInt(req.params.id, 10));
  if (!ok) return res.status(400).json({ success: false, message: 'Cannot cancel.' });
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  PROMOTIONS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/promotions  (auth) */
app.get('/api/promotions', requireAuth, (_req, res) => {
  res.json({ success: true, promotions: db.getAllPromotions() });
});

/** POST /api/promotions  (auth) */
app.post('/api/promotions', requireAuth, (req, res) => {
  const { code, type, value, minOrder, maxUses, expiresAt } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'Promo code required.' });
  try {
    const promo = db.createPromotion({ code, type, value, minOrder: minOrder ? toCents(minOrder) : 0, maxUses, expiresAt });
    db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'CREATE', entity: 'promotion', entityId: String(promo.id), details: { code } });
    res.status(201).json({ success: true, promo });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** PATCH /api/promotions/:id  (auth) */
app.patch('/api/promotions/:id', requireAuth, (req, res) => {
  const data = { ...req.body };
  if (data.value !== undefined) data.value = toCents(data.value);
  if (data.minOrder !== undefined) data.minOrder = toCents(data.minOrder);
  const promo = db.updatePromotion(parseInt(req.params.id, 10), data);
  if (!promo) return res.status(404).json({ success: false, message: 'Promo not found.' });
  res.json({ success: true, promo });
});

/** DELETE /api/promotions/:id  (owner) */
app.delete('/api/promotions/:id', requireOwner, (req, res) => {
  const ok = db.deletePromotion(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Promo not found.' });
  res.json({ success: true });
});

/** POST /api/promotions/validate  (public — POS) */
app.post('/api/promotions/validate', (req, res) => {
  const { code, orderTotal } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'code required.' });
  const result = db.validatePromoCode(code, toCents(orderTotal || 0));
  if (!result.valid) return res.status(400).json({ success: false, message: result.reason });
  res.json({ success: true, discountCents: result.discountCents, promo: result.promo });
});

// ════════════════════════════════════════════════════════════════════════════
//  SHIFTS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/shifts/current  (auth) */
app.get('/api/shifts/current', requireAuth, (req, res) => {
  const shift = db.getOpenShift(req.staff.id);
  if (!shift) return res.json({ success: true, shift: null });
  const movements = db.getShiftMovements(shift.id);
  const sales = db.getShiftSales(shift.id);
  res.json({ success: true, shift: { ...shift, movements, sales } });
});

/** GET /api/shifts  (auth) */
app.get('/api/shifts', requireAuth, (req, res) => {
  const { limit } = req.query;
  res.json({ success: true, shifts: db.getAllShifts(limit ? parseInt(limit, 10) : 50) });
});

/** POST /api/shifts/open  (auth) */
app.post('/api/shifts/open', requireAuth, (req, res) => {
  const { openingFloat } = req.body;
  const shift = db.openShift(req.staff.id, toCents(openingFloat || 0));
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'CREATE', entity: 'shift', entityId: String(shift.id), details: { openingFloat } });
  res.status(201).json({ success: true, shift });
});

/** POST /api/shifts/close  (auth) */
app.post('/api/shifts/close', requireAuth, (req, res) => {
  const { shiftId, closingFloat, notes } = req.body;
  if (!shiftId) return res.status(400).json({ success: false, message: 'shiftId required.' });
  const shift = db.closeShift(shiftId, toCents(closingFloat || 0), notes);
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'UPDATE', entity: 'shift', entityId: String(shiftId), details: { status: 'closed', closingFloat } });
  res.json({ success: true, shift });
});

/** POST /api/shifts/:id/cash  (auth) */
app.post('/api/shifts/:id/cash', requireAuth, (req, res) => {
  const { type, amount, reason } = req.body;
  if (!type || !amount) return res.status(400).json({ success: false, message: 'type and amount required.' });
  const movement = db.addCashMovement(parseInt(req.params.id, 10), type, toCents(amount), reason);
  res.status(201).json({ success: true, movement });
});

// ════════════════════════════════════════════════════════════════════════════
//  AUDIT LOGS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/audit  (owner) */
app.get('/api/audit', requireOwner, (req, res) => {
  const { entity, limit, offset } = req.query;
  const logs = db.getAuditLogs({ entity, limit: limit ? parseInt(limit, 10) : 50, offset: offset ? parseInt(offset, 10) : 0 });
  res.json({ success: true, logs });
});

// ════════════════════════════════════════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD  (auth) */
app.get('/api/reports/sales', requireAuth, (req, res) => {
  const { from, to } = req.query;
  const rows = db.getSalesReport({ from, to });
  // Compute totals
  const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  const totalOrders  = rows.reduce((s, r) => s + (r.orderCount || 0), 0);
  res.json({ success: true, rows, totalRevenue, totalOrders });
});

/** GET /api/reports/products?from=&to=&limit=  (auth) */
app.get('/api/reports/products', requireAuth, (req, res) => {
  const { from, to, limit } = req.query;
  res.json({ success: true, products: db.getProductPerformance({ from, to, limit: limit ? parseInt(limit, 10) : 20 }) });
});

// ════════════════════════════════════════════════════════════════════════════
//  Start
// ════════════════════════════════════════════════════════════════════════════


if (require.main === module) {
  // Warm up DB / run seed before accepting requests
  db.getDb();

  app.listen(PORT, () => {
    console.log(`\n🚀  Aura Coffee API  →  http://localhost:${PORT}/api`);
    console.log('   Auth:       POST /api/auth/login    GET /api/auth/me');
    console.log('   Menu:       GET /api/products       POST/PATCH/DELETE /api/menu');
    console.log('   Orders:     POST /api/orders        GET /api/orders/:id');
    console.log('   Analytics:  GET /api/analytics/today   /charts');
    console.log('   Settings:   GET /api/settings/cafe  PATCH /api/settings\n');
  });
}

module.exports = app;
