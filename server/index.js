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

/** Middleware: require owner or manager role */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.staff.role !== 'owner' && req.staff.role !== 'manager') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
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

// ── Health & Root ──────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    const orders = await db.loadOrders({ limit: 1 });
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.json({ status: 'degraded', timestamp: new Date().toISOString() });
  }
});

app.get('/', (req, res) => {
  res.send('Zamzam Cafe API Server is running.');
});

// ════════════════════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════════════════════

/** POST /api/auth/login */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required.' });
  }

  const staff = await db.getStaffByEmail(email.toLowerCase().trim());
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
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const staff = await db.getStaffById(req.staff.id);
  if (!staff) return res.status(404).json({ success: false, message: 'Staff not found.' });
  res.json({ success: true, staff });
});

/** POST /api/auth/pin-login — Cashier PIN login */
app.post('/api/auth/pin-login', async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, message: 'PIN must be 4 digits.' });
  }
  const staff = await db.getStaffByPin(pin);
  if (!staff) return res.status(401).json({ success: false, message: 'Invalid PIN.' });
  if (!staff.isActive) return res.status(403).json({ success: false, message: 'Account deactivated.' });
  const token = signToken(staff);
  const { password: _pw, ...safeStaff } = staff;
  res.json({ success: true, token, staff: safeStaff });
});

/** PATCH /api/auth/set-pin — Set/change own PIN (auth) */
app.patch('/api/auth/set-pin', requireAuth, async (req, res) => {
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, message: 'PIN must be 4 digits.' });
  }
  // Ensure PIN is unique
  const existing = await db.getStaffByPin(pin);
  if (existing && existing.id !== req.staff.id) {
    return res.status(400).json({ success: false, message: 'PIN already in use by another staff member.' });
  }
  await db.updateStaff(req.staff.id, { pin });
  res.json({ success: true, message: 'PIN updated successfully.' });
});

// ════════════════════════════════════════════════════════════════════════════
//  CATEGORIES
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/categories  (public) */
app.get('/api/categories', async (_req, res) => {
  res.json({ success: true, categories: await db.getCategories() });
});

/** POST /api/categories  (admin) */
app.post('/api/categories', requireAdmin, async (req, res) => {
  const { name, id, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Category name required.' });
  try {
    const cat = await db.createCategory({ name, id, sortOrder });
    res.status(201).json({ success: true, category: cat });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** DELETE /api/categories/:id  (admin) */
app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
  const ok = await db.deleteCategory(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'Category not found.' });
  res.json({ success: true, message: 'Category deleted.' });
});

// ════════════════════════════════════════════════════════════════════════════
//  MENU ITEMS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/products  (public) — used by the storefront */
app.get('/api/products', async (req, res) => {
  const { category } = req.query;
  const items = await db.getMenuItems(category ? { categoryId: category } : {});
  res.json({ success: true, items });
});

/** POST /api/menu/upload  — image upload (admin) */
app.post('/api/menu/upload', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No image provided.' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, url });
});

/** POST /api/menu  (admin) */
app.post('/api/menu', requireAdmin, async (req, res) => {
  const { title, description, price, categoryId, image, isAvailable } = req.body;
  if (!title || price === undefined || !categoryId) {
    return res.status(400).json({ success: false, message: 'title, price, and categoryId are required.' });
  }
  const item = await db.createMenuItem({
    title, description, price: toCents(price),
    categoryId, image, isAvailable,
  });
  res.status(201).json({ success: true, item });
});

/** PATCH /api/menu/:id  (admin) */
app.patch('/api/menu/:id', requireAdmin, async (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const data = { ...req.body };
  if (data.price !== undefined) data.price = toCents(data.price);

  const item = await db.updateMenuItem(id, data);
  if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
  res.json({ success: true, item });
});

/** DELETE /api/menu/:id  (admin) */
app.delete('/api/menu/:id', requireAdmin, async (req, res) => {
  const ok = await db.deleteMenuItem(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Item not found.' });
  res.json({ success: true, message: 'Item deleted.' });
});

// ════════════════════════════════════════════════════════════════════════════
//  STAFF
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/staff  (admin) */
app.get('/api/staff', requireAdmin, async (_req, res) => {
  res.json({ success: true, staff: await db.getAllStaff() });
});

/** POST /api/staff  (admin) */
app.post('/api/staff', requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email and password are required.' });
  }
  try {
    const member = await db.createStaff({ name, email: email.toLowerCase().trim(), password, role });
    res.status(201).json({ success: true, staff: member });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** PATCH /api/staff/:id  (admin) */
app.patch('/api/staff/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = await db.updateStaff(id, req.body);
  if (!updated) return res.status(404).json({ success: false, message: 'Staff not found.' });
  res.json({ success: true, staff: updated });
});

// ════════════════════════════════════════════════════════════════════════════
//  ORDERS  (storefront + admin)
// ════════════════════════════════════════════════════════════════════════════

/** POST /api/orders  — place an order (public) */
app.post('/api/orders', async (req, res) => {
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
    const dbItem = await db.getMenuItemById(item.id);
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
    await db.saveOrder(order);
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
app.get('/api/orders/kitchen', requireAuth, async (req, res) => {
  try {
    const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready'];
    const allActive = [];
    for (const status of activeStatuses) {
      const orders = await db.loadOrders({ status });
      allActive.push(...orders);
    }

    // Sort by createdAt ascending (oldest first)
    allActive.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Also fetch today's completed/served for performance stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const completedToday = await db.loadOrders({ status: 'delivered' }).filter(o =>
      new Date(o.createdAt) >= todayStart
    );
    const servedToday = await db.loadOrders({ status: 'served' }).filter(o =>
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
app.get('/api/orders', requireAuth, async (req, res) => {
  const { status, limit, offset } = req.query;
  const orders = await db.loadOrders({
    status,
    limit:  limit  ? parseInt(limit,  10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });
  res.json({ success: true, total: orders.length, orders });
});

/** GET /api/orders/:id  (public — customers check their own order) */
app.get('/api/orders/:id', async (req, res) => {
  const order = await db.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
  res.json({ success: true, order });
});

/** PATCH /api/orders/:id/status  (auth) */
app.patch('/api/orders/:id/status', requireAuth, async (req, res) => {
  const VALID = ['pending','confirmed','preparing','ready','served','delivered','cancelled'];
  const { status } = req.body;
  if (!VALID.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  const ok = await db.updateOrderStatus(req.params.id, status);
  if (!ok) return res.status(404).json({ success: false, message: 'Order not found.' });
  res.json({ success: true, order: await db.getOrderById(req.params.id) });
});

/** DELETE /api/orders  (owner) */
app.delete('/api/orders', requireOwner, async (_req, res) => {
  await db.clearAllOrders();
  res.json({ success: true, message: 'All orders cleared.' });
});

// ════════════════════════════════════════════════════════════════════════════
//  ANALYTICS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/analytics/today  (admin) */
app.get('/api/analytics/today', requireAdmin, async (_req, res) => {
  const stats = await db.getTodayStats();
  res.json({ success: true, stats });
});

/** GET /api/analytics/charts  (admin) */
app.get('/api/analytics/charts', requireAdmin, async (req, res) => {
  const days = parseInt(req.query.days || '7', 10);
  res.json({
    success: true,
    salesTrend: await db.getSalesTrend(days),
    topItems:   await db.getTopItems(10),
    hourly:     await db.getHourlySales(),
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/settings/cafe  (public — storefront needs cafe name) */
app.get('/api/settings/cafe', async (_req, res) => {
  res.json({ success: true, cafe: await db.getSetting('cafe') || {} });
});

/** PATCH /api/settings/cafe  (admin) */
app.patch('/api/settings/cafe', requireAdmin, async (req, res) => {
  const current = await db.getSetting('cafe') || {};
  const updated = { ...current, ...req.body };
  await db.setSetting('cafe', updated);
  res.json({ success: true, cafe: updated });
});

/** GET /api/settings  (auth) */
app.get('/api/settings', requireAuth, async (_req, res) => {
  res.json({ success: true, settings: await db.getAllSettings() });
});

/** PATCH /api/settings  (admin) */
app.patch('/api/settings', requireAdmin, async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ success: false, message: 'Setting key required.' });
  await db.setSetting(key, value);
  res.json({ success: true, message: 'Setting updated.' });
});


// ════════════════════════════════════════════════════════════════════════════
//  MODIFIERS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/modifiers  (public) */
app.get('/api/modifiers', async (_req, res) => {
  res.json({ success: true, modifiers: await db.getAllModifiers() });
});

/** GET /api/modifiers/product/:id  (public) */
app.get('/api/modifiers/product/:id', async (req, res) => {
  const mods = await db.getProductModifiers(parseInt(req.params.id, 10));
  res.json({ success: true, modifiers: mods });
});

/** POST /api/modifiers  (admin) */
app.post('/api/modifiers', requireAdmin, async (req, res) => {
  const { name, required, multiSelect } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Modifier name required.' });
  const mod = await db.createModifier({ name, required: !!required, multiSelect: !!multiSelect });
  res.status(201).json({ success: true, modifier: mod });
});

/** POST /api/modifiers/:id/options  (admin) */
app.post('/api/modifiers/:id/options', requireAdmin, async (req, res) => {
  const { label, priceAdjustment } = req.body;
  if (!label) return res.status(400).json({ success: false, message: 'Option label required.' });
  const opt = await db.addModifierOption(parseInt(req.params.id, 10), label, priceAdjustment || 0);
  res.status(201).json({ success: true, option: opt });
});

/** DELETE /api/modifiers/:id  (admin) */
app.delete('/api/modifiers/:id', requireAdmin, async (req, res) => {
  const ok = await db.deleteModifier(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Modifier not found.' });
  res.json({ success: true });
});

/** POST /api/menu/:id/modifiers  — link modifier to product (admin) */
app.post('/api/menu/:id/modifiers', requireAdmin, async (req, res) => {
  const { modifierId } = req.body;
  await db.linkModifierToProduct(parseInt(req.params.id, 10), modifierId);
  res.json({ success: true });
});

/** DELETE /api/menu/:id/modifiers/:mid  (admin) */
app.delete('/api/menu/:id/modifiers/:mid', requireAdmin, async (req, res) => {
  await db.unlinkModifierFromProduct(parseInt(req.params.id, 10), parseInt(req.params.mid, 10));
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  TABLES
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/tables  (public - POS needs to read tables) */
app.get('/api/tables', async (_req, res) => {
  res.json({ success: true, tables: await db.getAllTables() });
});

/** POST /api/tables  (admin) */
app.post('/api/tables', requireAdmin, async (req, res) => {
  const { number, capacity } = req.body;
  if (!number) return res.status(400).json({ success: false, message: 'Table number required.' });
  try {
    const table = await db.createCafeTable({ number, capacity });
    res.status(201).json({ success: true, table });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** PATCH /api/tables/:id/status  (auth) */
app.patch('/api/tables/:id/status', requireAuth, async (req, res) => {
  const VALID = ['available', 'occupied', 'reserved', 'cleaning'];
  const { status } = req.body;
  if (!VALID.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
  const ok = await db.updateTableStatus(parseInt(req.params.id, 10), status);
  if (!ok) return res.status(404).json({ success: false, message: 'Table not found.' });
  res.json({ success: true });
});

/** PATCH /api/tables/:id  (admin) — update table number, capacity, status */
app.patch('/api/tables/:id', requireAdmin, async (req, res) => {
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
    const info = await db.getDb().prepare(`UPDATE cafe_tables SET ${fields.join(', ')} WHERE id = ?`).run(...values);
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
app.get('/api/customers', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: true, customers: [] });
  res.json({ success: true, customers: await db.searchCustomers(q) });
});

/** GET /api/customers/:phone  (public — POS lookup) */
app.get('/api/customers/:phone', async (req, res) => {
  const info = await db.getLoyaltyByPhone(req.params.phone);
  if (!info) return res.status(404).json({ success: false, message: 'Customer not found.' });
  res.json({ success: true, customer: info });
});

/** POST /api/customers  (public — POS create walk-in customer) */
app.post('/api/customers', async (req, res) => {
  const { name, phone, email } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone number required.' });
  const cust = await db.createCustomer({ name, phone, email });
  res.status(201).json({ success: true, customer: cust });
});

/** POST /api/loyalty/redeem  (public — POS) */
app.post('/api/loyalty/redeem', async (req, res) => {
  const { phone, points } = req.body;
  if (!phone || !points) return res.status(400).json({ success: false, message: 'phone and points required.' });
  try {
    const discountCents = await db.redeemLoyaltyPoints(phone, parseInt(points, 10));
    res.json({ success: true, discountCents });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** GET /api/products/barcode/:code  (public — barcode scan) */
app.get('/api/products/barcode/:code', async (req, res) => {
  const item = await db.getMenuItemByBarcode(req.params.code);
  if (!item) return res.status(404).json({ success: false, message: 'Product not found.' });
  res.json({ success: true, item });
});

// ════════════════════════════════════════════════════════════════════════════
//  INVENTORY
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/inventory  (admin) */
app.get('/api/inventory', requireAdmin, async (_req, res) => {
  res.json({ success: true, inventory: await db.getInventory() });
});

/** PATCH /api/inventory/:productId  (admin) — set or adjust stock */
app.patch('/api/inventory/:productId', requireAdmin, async (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const { type, qty, reason, unit, lowStockThreshold } = req.body;
  if (type && qty !== undefined) {
    const item = await db.adjustStock(productId, type, qty, reason, req.staff.id);
    db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'UPDATE', entity: 'inventory', entityId: String(productId), details: { type, qty, reason } });
    return res.json({ success: true, item });
  }
  // Otherwise upsert
  const item = await db.upsertInventory(productId, qty || 0, unit, lowStockThreshold);
  res.json({ success: true, item });
});

/** GET /api/inventory/movements  (admin) */
app.get('/api/inventory/movements', requireAdmin, async (req, res) => {
  const { productId, limit } = req.query;
  res.json({ success: true, movements: await db.getStockMovements(productId ? parseInt(productId, 10) : null, limit ? parseInt(limit, 10) : 100) });
});

// ════════════════════════════════════════════════════════════════════════════
//  SUPPLIERS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/suppliers  (admin) */
app.get('/api/suppliers', requireAdmin, async (_req, res) => {
  res.json({ success: true, suppliers: await db.getAllSuppliers() });
});

/** POST /api/suppliers  (admin) */
app.post('/api/suppliers', requireAdmin, async (req, res) => {
  const { name, phone, email, address, notes } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Supplier name required.' });
  const supplier = await db.createSupplier({ name, phone, email, address, notes });
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'CREATE', entity: 'supplier', entityId: String(supplier.id), details: { name } });
  res.status(201).json({ success: true, supplier });
});

/** PATCH /api/suppliers/:id  (admin) */
app.patch('/api/suppliers/:id', requireAdmin, async (req, res) => {
  const supplier = await db.updateSupplier(parseInt(req.params.id, 10), req.body);
  if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found.' });
  res.json({ success: true, supplier });
});

/** DELETE /api/suppliers/:id  (admin) */
app.delete('/api/suppliers/:id', requireAdmin, async (req, res) => {
  const ok = await db.deleteSupplier(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Supplier not found.' });
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'DELETE', entity: 'supplier', entityId: req.params.id });
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  PURCHASE ORDERS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/purchase-orders  (admin) */
app.get('/api/purchase-orders', requireAdmin, async (req, res) => {
  const { supplierId } = req.query;
  res.json({ success: true, orders: await db.getAllPurchaseOrders(supplierId ? parseInt(supplierId, 10) : null) });
});

/** POST /api/purchase-orders  (admin) */
app.post('/api/purchase-orders', requireAdmin, async (req, res) => {
  const { supplierId, items, totalAmount, notes } = req.body;
  if (!supplierId) return res.status(400).json({ success: false, message: 'supplierId required.' });
  const order = await db.createPurchaseOrder({ supplierId, items, totalAmount, notes });
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'CREATE', entity: 'purchase_order', entityId: String(order.id) });
  res.status(201).json({ success: true, order });
});

/** POST /api/purchase-orders/:id/receive  (admin) — marks received + adjusts stock */
app.post('/api/purchase-orders/:id/receive', requireAdmin, async (req, res) => {
  const order = await db.receivePurchaseOrder(parseInt(req.params.id, 10), req.staff.id);
  if (!order) return res.status(400).json({ success: false, message: 'Order not found or already received.' });
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'UPDATE', entity: 'purchase_order', entityId: req.params.id, details: { status: 'received' } });
  res.json({ success: true, order });
});

/** POST /api/purchase-orders/:id/cancel  (admin) */
app.post('/api/purchase-orders/:id/cancel', requireAdmin, async (req, res) => {
  const ok = await db.cancelPurchaseOrder(parseInt(req.params.id, 10));
  if (!ok) return res.status(400).json({ success: false, message: 'Cannot cancel.' });
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  PROMOTIONS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/promotions  (admin) */
app.get('/api/promotions', requireAdmin, async (_req, res) => {
  res.json({ success: true, promotions: await db.getAllPromotions() });
});

/** POST /api/promotions  (admin) */
app.post('/api/promotions', requireAdmin, async (req, res) => {
  const { code, type, value, minOrder, maxUses, expiresAt } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'Promo code required.' });
  try {
    const promo = await db.createPromotion({ code, type, value, minOrder: minOrder ? toCents(minOrder) : 0, maxUses, expiresAt });
    db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'CREATE', entity: 'promotion', entityId: String(promo.id), details: { code } });
    res.status(201).json({ success: true, promo });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** PATCH /api/promotions/:id  (admin) */
app.patch('/api/promotions/:id', requireAdmin, async (req, res) => {
  const data = { ...req.body };
  if (data.value !== undefined) data.value = toCents(data.value);
  if (data.minOrder !== undefined) data.minOrder = toCents(data.minOrder);
  const promo = await db.updatePromotion(parseInt(req.params.id, 10), data);
  if (!promo) return res.status(404).json({ success: false, message: 'Promo not found.' });
  res.json({ success: true, promo });
});

/** DELETE /api/promotions/:id  (admin) */
app.delete('/api/promotions/:id', requireAdmin, async (req, res) => {
  const ok = await db.deletePromotion(parseInt(req.params.id, 10));
  if (!ok) return res.status(404).json({ success: false, message: 'Promo not found.' });
  res.json({ success: true });
});

/** POST /api/promotions/validate  (public — POS) */
app.post('/api/promotions/validate', async (req, res) => {
  const { code, orderTotal } = req.body;
  if (!code) return res.status(400).json({ success: false, message: 'code required.' });
  const result = await db.validatePromoCode(code, toCents(orderTotal || 0));
  if (!result.valid) return res.status(400).json({ success: false, message: result.reason });
  res.json({ success: true, discountCents: result.discountCents, promo: result.promo });
});

// ════════════════════════════════════════════════════════════════════════════
//  SHIFTS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/shifts/current  (auth) */
app.get('/api/shifts/current', requireAuth, async (req, res) => {
  const shift = await db.getOpenShift(req.staff.id);
  if (!shift) return res.json({ success: true, shift: null });
  const movements = await db.getShiftMovements(shift.id);
  const sales = await db.getShiftSales(shift.id);
  res.json({ success: true, shift: { ...shift, movements, sales } });
});

/** GET /api/shifts  (auth) */
app.get('/api/shifts', requireAuth, async (req, res) => {
  const { limit } = req.query;
  res.json({ success: true, shifts: await db.getAllShifts(limit ? parseInt(limit, 10) : 50) });
});

/** GET /api/shifts/:id  (auth) — Full shift detail for session reports */
app.get('/api/shifts/:id', requireAuth, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10);
  const shiftRow = await db.getDb().prepare('SELECT s.*, st.name as staffName FROM shifts s JOIN staff st ON st.id = s.staffId WHERE s.id = ?').get(shiftId);
  if (!shiftRow) return res.status(404).json({ success: false, message: 'Shift not found.' });
  const movements = await db.getShiftMovements(shiftId);
  const sales = await db.getShiftSales(shiftId);
  // Get orders for this shift
  const orders = await db.getDb().prepare("SELECT id, status, createdAt, totalAmount, paymentMethod, orderType FROM orders WHERE shiftId = ? ORDER BY createdAt DESC").all(shiftId);
  res.json({ success: true, shift: { ...shiftRow, movements, sales, orders } });
});

/** POST /api/shifts/open  (auth) */
app.post('/api/shifts/open', requireAuth, async (req, res) => {
  const { openingFloat } = req.body;
  const shift = await db.openShift(req.staff.id, toCents(openingFloat || 0));
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'CREATE', entity: 'shift', entityId: String(shift.id), details: { openingFloat } });
  res.status(201).json({ success: true, shift });
});

/** POST /api/shifts/close  (auth) */
app.post('/api/shifts/close', requireAuth, async (req, res) => {
  const { shiftId, closingFloat, notes } = req.body;
  if (!shiftId) return res.status(400).json({ success: false, message: 'shiftId required.' });
  const shift = await db.closeShift(shiftId, toCents(closingFloat || 0), notes);
  db.addAuditLog({ staffId: req.staff.id, staffName: req.staff.name, action: 'UPDATE', entity: 'shift', entityId: String(shiftId), details: { status: 'closed', closingFloat } });
  res.json({ success: true, shift });
});

/** POST /api/shifts/:id/cash  (auth) */
app.post('/api/shifts/:id/cash', requireAuth, async (req, res) => {
  const { type, amount, reason } = req.body;
  if (!type || !amount) return res.status(400).json({ success: false, message: 'type and amount required.' });
  const movement = await db.addCashMovement(parseInt(req.params.id, 10), type, toCents(amount), reason);
  res.status(201).json({ success: true, movement });
});

// ════════════════════════════════════════════════════════════════════════════
//  AUDIT LOGS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/audit  (owner) */
app.get('/api/audit', requireOwner, async (req, res) => {
  const { entity, limit, offset } = req.query;
  const logs = await db.getAuditLogs({ entity, limit: limit ? parseInt(limit, 10) : 50, offset: offset ? parseInt(offset, 10) : 0 });
  res.json({ success: true, logs });
});

// ════════════════════════════════════════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD  (admin) */
app.get('/api/reports/sales', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const rows = await db.getSalesReport({ from, to });
  // Compute totals
  const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  const totalOrders  = rows.reduce((s, r) => s + (r.orderCount || 0), 0);
  res.json({ success: true, rows, totalRevenue, totalOrders });
});

/** GET /api/reports/products?from=&to=&limit=  (admin) */
app.get('/api/reports/products', requireAdmin, async (req, res) => {
  const { from, to, limit } = req.query;
  res.json({ success: true, products: await db.getProductPerformance({ from, to, limit: limit ? parseInt(limit, 10) : 20 }) });
});

// ════════════════════════════════════════════════════════════════════════════
//  MANAGER REPORTS
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/reports/manager  (admin) */
app.get('/api/reports/manager', requireAdmin, async (req, res) => {
  const { limit, offset } = req.query;
  const reports = await db.getManagerReports({ limit: limit ? parseInt(limit, 10) : 50, offset: offset ? parseInt(offset, 10) : 0 });
  res.json({ success: true, reports });
});

/** POST /api/reports/manager  (auth) */
app.post('/api/reports/manager', requireAuth, async (req, res) => {
  const { message, shiftId } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'Message is required.' });
  
  const report = await db.addManagerReport({
    staffId: req.staff.id,
    staffName: req.staff.name || req.staff.email || 'Staff',
    message,
    shiftId
  });
  res.status(201).json({ success: true, report });
});

/** PATCH /api/reports/manager/:id/read  (admin) */
app.patch('/api/reports/manager/:id/read', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const report = await db.markManagerReportRead(id);
  res.json({ success: true, report });
});

// ════════════════════════════════════════════════════════════════════════════
//  Start
// ════════════════════════════════════════════════════════════════════════════


if (require.main === module) {
  (async () => {
    // Warm up DB / run seed before accepting requests
    await db.initDb();

    app.listen(PORT, () => {
      console.log(`\n🚀  Zamzam Cafe API  →  http://localhost:${PORT}/api`);
      console.log('   Auth:       POST /api/auth/login    GET /api/auth/me');
      console.log('   Menu:       GET /api/products       POST/PATCH/DELETE /api/menu');
      console.log('   Orders:     POST /api/orders        GET /api/orders/:id');
      console.log('   Analytics:  GET /api/analytics/today   /charts');
      console.log('   Settings:   GET /api/settings/cafe  PATCH /api/settings\n');
    });
  })();
}

module.exports = app;
// ─────────────────────────────────────────────────────────────────────────────
//  Enterprise API Routes — to be appended to server/index.js
//  These routes cover: Attendance, Shift Scheduling, Payroll, and Financial Mgmt
// ─────────────────────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
//  ENTERPRISE: ATTENDANCE
// ════════════════════════════════════════════════════════════════════════════

/** POST /api/attendance/clock-in  (auth) */
app.post('/api/attendance/clock-in', requireAuth, async (req, res) => {
  const record = await db.clockIn(req.staff.id);
  res.status(201).json({ success: true, record });
});

/** POST /api/attendance/clock-out  (auth) */
app.post('/api/attendance/clock-out', requireAuth, async (req, res) => {
  const record = await db.clockOut(req.staff.id);
  if (!record) return res.status(400).json({ success: false, message: 'No active clock-in found.' });
  res.json({ success: true, record });
});

/** GET /api/attendance  (admin) */
app.get('/api/attendance', requireAdmin, async (req, res) => {
  const { staffId, from, to, limit } = req.query;
  const records = await db.getAttendance({ staffId, from, to, limit });
  res.json({ success: true, records });
});

// ════════════════════════════════════════════════════════════════════════════
//  ENTERPRISE: SHIFT SCHEDULING
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/schedules?from=YYYY-MM-DD&to=YYYY-MM-DD&staffId=  (admin) */
app.get('/api/schedules', requireAdmin, async (req, res) => {
  const { from, to, staffId } = req.query;
  const schedules = await db.getSchedules({ from, to, staffId });
  res.json({ success: true, schedules });
});

/** POST /api/schedules  (admin) */
app.post('/api/schedules', requireAdmin, async (req, res) => {
  const { staffId, date, startTime, endTime, role, notes } = req.body;
  if (!staffId || !date || !startTime || !endTime) {
    return res.status(400).json({ success: false, message: 'staffId, date, startTime, endTime are required.' });
  }
  const schedule = await db.createSchedule({ staffId, date, startTime, endTime, role, notes });
  res.status(201).json({ success: true, schedule });
});

/** PATCH /api/schedules/:id  (admin) */
app.patch('/api/schedules/:id', requireAdmin, async (req, res) => {
  const schedule = await db.updateSchedule(parseInt(req.params.id), req.body);
  res.json({ success: true, schedule });
});

/** DELETE /api/schedules/:id  (admin) */
app.delete('/api/schedules/:id', requireAdmin, async (req, res) => {
  const ok = await db.deleteSchedule(parseInt(req.params.id));
  if (!ok) return res.status(404).json({ success: false, message: 'Schedule not found.' });
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  ENTERPRISE: PAYROLL
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/payroll?staffId=&status=  (admin) */
app.get('/api/payroll', requireAdmin, async (req, res) => {
  const { staffId, status } = req.query;
  const payroll = await db.getAllPayroll({ staffId, status });
  res.json({ success: true, payroll });
});

/** POST /api/payroll  (admin) */
app.post('/api/payroll', requireAdmin, async (req, res) => {
  const { staffId, periodStart, periodEnd, hoursWorked, hourlyRate, grossPay, deductions, netPay, notes } = req.body;
  if (!staffId || !periodStart || !periodEnd) {
    return res.status(400).json({ success: false, message: 'staffId, periodStart, periodEnd are required.' });
  }
  const record = await db.createPayroll({ staffId, periodStart, periodEnd, hoursWorked, hourlyRate, grossPay, deductions, netPay, notes });
  res.status(201).json({ success: true, record });
});

/** PATCH /api/payroll/:id  (admin) */
app.patch('/api/payroll/:id', requireAdmin, async (req, res) => {
  const record = await db.updatePayroll(parseInt(req.params.id), req.body);
  res.json({ success: true, record });
});

/** POST /api/payroll/:id/approve  (admin) */
app.post('/api/payroll/:id/approve', requireAdmin, async (req, res) => {
  const record = await db.approvePayroll(parseInt(req.params.id));
  res.json({ success: true, record });
});

/** POST /api/payroll/:id/pay  (owner only) */
app.post('/api/payroll/:id/pay', requireOwner, async (req, res) => {
  const record = await db.markPayrollPaid(parseInt(req.params.id));
  res.json({ success: true, record });
});

// ════════════════════════════════════════════════════════════════════════════
//  ENTERPRISE: FINANCIAL MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/finance/p-and-l?from=YYYY-MM-DD&to=YYYY-MM-DD  (admin) */
app.get('/api/finance/p-and-l', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const report = await db.getProfitAndLoss({ from, to });
  res.json({ success: true, report });
});

/** GET /api/finance/transactions  (admin) */
app.get('/api/finance/transactions', requireAdmin, async (req, res) => {
  const { from, to, type, category, limit } = req.query;
  const transactions = await db.getTransactions({ from, to, type, category, limit });
  res.json({ success: true, transactions });
});

/** POST /api/finance/transactions  (admin) */
app.post('/api/finance/transactions', requireAdmin, async (req, res) => {
  const { type, category, amount, description, reference, date } = req.body;
  if (!type || !category || amount === undefined || !description) {
    return res.status(400).json({ success: false, message: 'type, category, amount, description are required.' });
  }
  const transaction = await db.createTransaction({ type, category, amount: toCents(amount), description, reference, date, createdBy: req.staff.id });
  res.status(201).json({ success: true, transaction });
});

/** GET /api/finance/expenses  (admin) */
app.get('/api/finance/expenses', requireAdmin, async (req, res) => {
  const { from, to, category, status, limit } = req.query;
  const expenses = await db.getExpenses({ from, to, category, status, limit });
  res.json({ success: true, expenses });
});

/** POST /api/finance/expenses  (admin) */
app.post('/api/finance/expenses', requireAdmin, async (req, res) => {
  const { category, amount, description, vendor, receiptUrl, date } = req.body;
  if (!category || amount === undefined || !description) {
    return res.status(400).json({ success: false, message: 'category, amount, description are required.' });
  }
  const expense = await db.createExpense({ category, amount: toCents(amount), description, vendor, receiptUrl, date, approvedBy: req.staff.id });
  res.status(201).json({ success: true, expense });
});

/** PATCH /api/finance/expenses/:id  (admin) */
app.patch('/api/finance/expenses/:id', requireAdmin, async (req, res) => {
  const expense = await db.updateExpense(parseInt(req.params.id), req.body);
  res.json({ success: true, expense });
});

/** GET /api/finance/reconciliation  (admin) */
app.get('/api/finance/reconciliation', requireAdmin, async (req, res) => {
  const { from, to, status } = req.query;
  const records = await db.getCashReconciliations({ from, to, status });
  res.json({ success: true, records });
});

/** POST /api/finance/reconciliation  (admin) */
app.post('/api/finance/reconciliation', requireAdmin, async (req, res) => {
  const { date, openingBalance, cashSales, cashIn, cashOut, actualBalance, notes } = req.body;
  const record = await db.createCashReconciliation({
    date,
    openingBalance: toCents(openingBalance || 0),
    cashSales: toCents(cashSales || 0),
    cashIn: toCents(cashIn || 0),
    cashOut: toCents(cashOut || 0),
    actualBalance: toCents(actualBalance || 0),
    notes,
  });
  res.status(201).json({ success: true, record });
});

/** GET /api/finance/tax  (admin) */
app.get('/api/finance/tax', requireAdmin, async (req, res) => {
  const { status } = req.query;
  const records = await db.getTaxRecords({ status });
  res.json({ success: true, records });
});

/** POST /api/finance/tax  (owner) */
app.post('/api/finance/tax', requireOwner, async (req, res) => {
  const { period, periodType, taxableIncome, taxRate, dueDate } = req.body;
  if (!period || taxableIncome === undefined) {
    return res.status(400).json({ success: false, message: 'period and taxableIncome are required.' });
  }
  const record = await db.createTaxRecord({ period, periodType, taxableIncome: toCents(taxableIncome), taxRate, dueDate });
  res.status(201).json({ success: true, record });
});
