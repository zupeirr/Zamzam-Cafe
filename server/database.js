'use strict';
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, 'test', 'test.db')
  : path.join(__dirname, 'cafe.db');
let dbInstance = null;

// ── Bootstrap ────────────────────────────────────────────────────────────────

function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = new DatabaseSync(DB_PATH);
  dbInstance.exec('PRAGMA journal_mode=WAL;');
  dbInstance.exec('PRAGMA foreign_keys=ON;');

  _createTables(dbInstance);
  _migrate(dbInstance);
  _seed(dbInstance);

  return dbInstance;
}

function _createTables(db) {
  db.exec(`
    -- Categories
    CREATE TABLE IF NOT EXISTS categories (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sortOrder INTEGER DEFAULT 0
    );

    -- Menu items  (price in CENTS — integer)
    CREATE TABLE IF NOT EXISTS menu_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      price       INTEGER NOT NULL,          -- cents
      categoryId  TEXT    NOT NULL,
      image       TEXT    NOT NULL DEFAULT '',
      isAvailable INTEGER NOT NULL DEFAULT 1,
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT
    );

    -- Staff / users
    CREATE TABLE IF NOT EXISTS staff (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      email     TEXT    NOT NULL UNIQUE,
      password  TEXT    NOT NULL,            -- bcrypt hash
      role      TEXT    NOT NULL DEFAULT 'staff',  -- 'owner' | 'staff'
      isActive  INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Orders  (totalAmount now in CENTS)
    CREATE TABLE IF NOT EXISTS orders (
      id            TEXT    PRIMARY KEY,
      status        TEXT    NOT NULL,
      createdAt     TEXT    NOT NULL,
      updatedAt     TEXT,
      customer      TEXT    NOT NULL,   -- JSON
      orderType     TEXT    NOT NULL,
      items         TEXT    NOT NULL,   -- JSON
      paymentMethod TEXT    NOT NULL,
      notes         TEXT,
      totalAmount   INTEGER NOT NULL    -- cents
    );

    -- Key/value settings store
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL   -- JSON string
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL DEFAULT '',
      phone     TEXT    NOT NULL UNIQUE,
      email     TEXT    NOT NULL DEFAULT '',
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Loyalty points
    CREATE TABLE IF NOT EXISTS loyalty (
      customerId    INTEGER PRIMARY KEY,
      points        INTEGER NOT NULL DEFAULT 0,
      lifetimePoints INTEGER NOT NULL DEFAULT 0,
      totalSpent    INTEGER NOT NULL DEFAULT 0,
      totalOrders   INTEGER NOT NULL DEFAULT 0,
      updatedAt     TEXT
    );

    -- Restaurant / cafe tables
    CREATE TABLE IF NOT EXISTS cafe_tables (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      number   INTEGER NOT NULL UNIQUE,
      capacity INTEGER NOT NULL DEFAULT 4,
      status   TEXT    NOT NULL DEFAULT 'available'
    );

    -- Modifier groups (Size, Milk, etc.)
    CREATE TABLE IF NOT EXISTS modifiers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      required    INTEGER NOT NULL DEFAULT 0,
      multiSelect INTEGER NOT NULL DEFAULT 0
    );

    -- Options within a modifier group
    CREATE TABLE IF NOT EXISTS modifier_options (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      modifierId      INTEGER NOT NULL,
      label           TEXT    NOT NULL,
      priceAdjustment INTEGER NOT NULL DEFAULT 0
    );

    -- Product <-> Modifier link
    CREATE TABLE IF NOT EXISTS product_modifiers (
      productId  INTEGER NOT NULL,
      modifierId INTEGER NOT NULL,
      PRIMARY KEY (productId, modifierId)
    );

    -- Inventory stock levels
    CREATE TABLE IF NOT EXISTS inventory (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      productId        INTEGER NOT NULL UNIQUE,
      quantity         INTEGER NOT NULL DEFAULT 0,
      unit             TEXT    NOT NULL DEFAULT 'units',
      lowStockThreshold INTEGER NOT NULL DEFAULT 5,
      updatedAt        TEXT
    );

    -- Stock movement log
    CREATE TABLE IF NOT EXISTS stock_movements (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL,
      type      TEXT    NOT NULL,   -- 'in' | 'out' | 'adjust'
      qty       INTEGER NOT NULL,
      reason    TEXT    NOT NULL DEFAULT '',
      staffId   INTEGER,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Suppliers
    CREATE TABLE IF NOT EXISTS suppliers (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      phone     TEXT    NOT NULL DEFAULT '',
      email     TEXT    NOT NULL DEFAULT '',
      address   TEXT    NOT NULL DEFAULT '',
      notes     TEXT    NOT NULL DEFAULT '',
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Purchase orders
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId  INTEGER NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | received | cancelled
      items       TEXT    NOT NULL DEFAULT '[]',       -- JSON [{productId, productName, qty, unit, costPerUnit}]
      totalAmount INTEGER NOT NULL DEFAULT 0,          -- cents
      notes       TEXT    NOT NULL DEFAULT '',
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now')),
      receivedAt  TEXT
    );

    -- Promotions / coupon codes
    CREATE TABLE IF NOT EXISTS promotions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      code      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      type      TEXT    NOT NULL DEFAULT 'flat',  -- 'flat' | 'percent'
      value     INTEGER NOT NULL DEFAULT 0,        -- cents (flat) or basis points (percent * 100)
      minOrder  INTEGER NOT NULL DEFAULT 0,        -- minimum order in cents
      maxUses   INTEGER NOT NULL DEFAULT 0,        -- 0 = unlimited
      usedCount INTEGER NOT NULL DEFAULT 0,
      expiresAt TEXT,
      isActive  INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Shifts
    CREATE TABLE IF NOT EXISTS shifts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      staffId       INTEGER NOT NULL,
      openedAt      TEXT    NOT NULL DEFAULT (datetime('now')),
      closedAt      TEXT,
      openingFloat  INTEGER NOT NULL DEFAULT 0,   -- cents
      closingFloat  INTEGER,                       -- cents
      notes         TEXT    NOT NULL DEFAULT '',
      status        TEXT    NOT NULL DEFAULT 'open'  -- 'open' | 'closed'
    );

    -- Cash movements within a shift
    CREATE TABLE IF NOT EXISTS cash_movements (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      shiftId   INTEGER NOT NULL,
      type      TEXT    NOT NULL,   -- 'in' | 'out'
      amount    INTEGER NOT NULL,   -- cents
      reason    TEXT    NOT NULL DEFAULT '',
      createdAt TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Audit log
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      staffId    INTEGER,
      staffName  TEXT    NOT NULL DEFAULT 'System',
      action     TEXT    NOT NULL,   -- 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT'
      entity     TEXT    NOT NULL,   -- 'order' | 'product' | 'staff' | 'settings' ...
      entityId   TEXT,
      details    TEXT    NOT NULL DEFAULT '{}',  -- JSON
      createdAt  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/** Add columns / indexes that didn't exist in v1 of the schema */
function _migrate(db) {
  // Add barcode field to menu_items
  try { db.exec("ALTER TABLE menu_items ADD COLUMN barcode TEXT NOT NULL DEFAULT ''"); } catch {}
  // Add discount/staff tracking to orders
  try { db.exec("ALTER TABLE orders ADD COLUMN discountAmount INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN staffId INTEGER"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN shiftId INTEGER"); } catch {}
}

function _seed(db) {
  // ── Categories ─────────────────────────────────────────────────────────────
  const catCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get();
  if (catCount.n === 0) {
    const catInsert = db.prepare(
      'INSERT OR IGNORE INTO categories (id, name, sortOrder) VALUES (?, ?, ?)'
    );
    const cats = [
      ['HotDrinks',  'Hot Drinks',  1],
      ['ColdDrinks', 'Cold Drinks', 2],
      ['IceCream',   'Ice Cream',   3],
      ['Shakes',     'Shakes',      4],
      ['Pancakes',   'Pancakes',    5],
      ['Cakes',      'Cakes',       6],
    ];
    for (const c of cats) catInsert.run(...c);
    console.log('🌱  Categories seeded.');
  }

  // ── Menu items ─────────────────────────────────────────────────────────────
  const itemCount = db.prepare('SELECT COUNT(*) AS n FROM menu_items').get();
  if (itemCount.n === 0) {
    const products = require('./products.json');
    const itemInsert = db.prepare(`
      INSERT INTO menu_items (title, description, price, categoryId, image, isAvailable)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    for (const p of products) {
      // Convert "0.71$" string → integer cents
      const priceCents = Math.round(
        parseFloat(p.price.replace('$', '')) * 100
      );
      itemInsert.run(
        p.title,
        p.description || '',
        priceCents,
        p.category,
        p.image || ''
      );
    }
    console.log(`🌱  Menu items seeded (${products.length} items).`);
  }

  // ── Default owner account ──────────────────────────────────────────────────
  const staffCount = db.prepare('SELECT COUNT(*) AS n FROM staff').get();
  if (staffCount.n === 0) {
    const hash = bcrypt.hashSync('admin_password_123', 10);
    db.prepare(`
      INSERT OR IGNORE INTO staff (name, email, password, role)
      VALUES ('Owner', 'admin@auracoffee.com', ?, 'owner')
    `).run(hash);
    console.log('🌱  Default owner account seeded → admin@auracoffee.com / admin_password_123');
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  const settingsCount = db.prepare('SELECT COUNT(*) AS n FROM settings').get();
  if (settingsCount.n === 0) {
    const set = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    set.run('cafe', JSON.stringify({
      name: 'Aura Coffee',
      address: '123 Coffee Lane, Brewtown',
      phone: '+1 (555) 123-4567',
      email: 'hello@auracoffee.com',
      hours: 'Mon–Sun: 7:00 AM – 11:00 PM',
      currency: 'USD',
      deliveryFee: 200,
      minimumOrder: 0,
    }));
    set.run('notifications', JSON.stringify({ newOrderSound: true, emailAlerts: false }));
    set.run('payments', JSON.stringify({ acceptCash: true, acceptCard: false }));
    set.run('tax', JSON.stringify({ rate: 0 }));
    set.run('service', JSON.stringify({ rate: 0 }));
    set.run('loyalty', JSON.stringify({ enabled: true, pointsPerDollar: 1, pointsPerRedemption: 100, redemptionValue: 1 }));
    console.log('🌱  Default settings seeded.');
  }

  // ── Cafe tables ─────────────────────────────────────────────────────────────
  const tableCount = db.prepare('SELECT COUNT(*) AS n FROM cafe_tables').get();
  if (tableCount.n === 0) {
    const tblInsert = db.prepare('INSERT INTO cafe_tables (number, capacity) VALUES (?, ?)');
    for (let i = 1; i <= 12; i++) tblInsert.run(i, 4);
    console.log('🌱  Cafe tables seeded (12 tables).');
  }

  // ── Default modifiers ────────────────────────────────────────────────────────
  const modCount = db.prepare('SELECT COUNT(*) AS n FROM modifiers').get();
  if (modCount.n === 0) {
    const groups = [
      { name: 'Size',        required: 1, multi: 0, opts: [['Small', 0], ['Medium', 50], ['Large', 100]] },
      { name: 'Milk',        required: 0, multi: 0, opts: [['Whole Milk', 0], ['Skim Milk', 0], ['Soy Milk', 50], ['Almond Milk', 50], ['Oat Milk', 50]] },
      { name: 'Sugar Level', required: 0, multi: 0, opts: [['No Sugar', 0], ['Less Sugar', 0], ['Normal', 0], ['Extra Sweet', 0]] },
      { name: 'Ice Level',   required: 0, multi: 0, opts: [['No Ice', 0], ['Less Ice', 0], ['Normal Ice', 0], ['Extra Ice', 0]] },
      { name: 'Extras',      required: 0, multi: 1, opts: [['Extra Shot', 75], ['Whipped Cream', 50], ['Vanilla Syrup', 50], ['Caramel Syrup', 50], ['Hazelnut Syrup', 50]] },
    ];
    const mIns = db.prepare('INSERT INTO modifiers (name, required, multiSelect) VALUES (?, ?, ?)');
    const oIns = db.prepare('INSERT INTO modifier_options (modifierId, label, priceAdjustment) VALUES (?, ?, ?)');
    for (const g of groups) {
      const { lastInsertRowid: mid } = mIns.run(g.name, g.required, g.multi);
      for (const [label, adj] of g.opts) oIns.run(mid, label, adj);
    }
    console.log('🌱  Default modifiers seeded.');
  }
}

// ── Order helpers ─────────────────────────────────────────────────────────────

function loadOrders({ status, limit, offset } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (status) { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY createdAt DESC';
  if (limit)  { sql += ' LIMIT ?';  params.push(limit); }
  if (offset) { sql += ' OFFSET ?'; params.push(offset); }
  return db.prepare(sql).all(...params).map(_parseOrder);
}

function getOrderById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  return row ? _parseOrder(row) : null;
}

function saveOrder(order) {
  const db = getDb();
  db.prepare(`
    INSERT INTO orders
      (id, status, createdAt, updatedAt, customer, orderType, items, paymentMethod, notes, totalAmount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    order.id,
    order.status,
    order.createdAt,
    order.updatedAt || null,
    JSON.stringify(order.customer),
    order.orderType,
    JSON.stringify(order.items),
    order.paymentMethod,
    order.notes || '',
    order.totalAmount   // integer cents
  );
}

function updateOrderStatus(id, status) {
  const db = getDb();
  const info = db.prepare(
    'UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?'
  ).run(status, new Date().toISOString(), id);
  return info.changes > 0;
}

function clearAllOrders() {
  getDb().exec('DELETE FROM orders');
}

function _parseOrder(row) {
  return {
    ...row,
    customer: JSON.parse(row.customer),
    items: JSON.parse(row.items),
  };
}

// ── Menu helpers ──────────────────────────────────────────────────────────────

function getMenuItems({ categoryId } = {}) {
  const db = getDb();
  if (categoryId) {
    return db.prepare(
      'SELECT * FROM menu_items WHERE categoryId = ? ORDER BY title'
    ).all(categoryId);
  }
  return db.prepare('SELECT * FROM menu_items ORDER BY categoryId, title').all();
}

function getMenuItemById(id) {
  return getDb().prepare('SELECT * FROM menu_items WHERE id = ?').get(id) || null;
}

function createMenuItem(data) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO menu_items (title, description, price, categoryId, image, isAvailable)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.title, data.description || '', data.price,
    data.categoryId, data.image || '', data.isAvailable ?? 1
  );
  return getMenuItemById(info.lastInsertRowid);
}

function updateMenuItem(id, data) {
  const db = getDb();
  const fields = [];
  const values = [];

  const allowed = ['title','description','price','categoryId','image','isAvailable'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return getMenuItemById(id);

  fields.push("updatedAt = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE menu_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getMenuItemById(id);
}

function deleteMenuItem(id) {
  const info = getDb().prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  return info.changes > 0;
}

// ── Category helpers ──────────────────────────────────────────────────────────

function getCategories() {
  return getDb().prepare('SELECT * FROM categories ORDER BY sortOrder, name').all();
}

function createCategory(data) {
  const db = getDb();
  // Normalise id: 'Hot Drinks' → 'HotDrinks'
  const id = data.id || data.name.replace(/\s+/g, '');
  const maxSort = db.prepare('SELECT MAX(sortOrder) AS m FROM categories').get().m || 0;
  db.prepare(
    'INSERT INTO categories (id, name, sortOrder) VALUES (?, ?, ?)'
  ).run(id, data.name, data.sortOrder ?? maxSort + 1);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function deleteCategory(id) {
  const info = getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
  return info.changes > 0;
}

// ── Staff helpers ─────────────────────────────────────────────────────────────

function getStaffById(id) {
  const row = getDb().prepare('SELECT * FROM staff WHERE id = ?').get(id);
  return row ? _stripPassword(row) : null;
}

function getStaffByEmail(email) {
  return getDb().prepare('SELECT * FROM staff WHERE email = ?').get(email) || null;
}

function getStaffByPin(pin) {
  // Returns the raw row (with password) so caller can check isActive
  return getDb().prepare('SELECT * FROM staff WHERE pin = ?').get(pin) || null;
}

function getAllStaff() {
  return getDb().prepare('SELECT * FROM staff ORDER BY createdAt DESC').all()
    .map(_stripPassword);
}

function createStaff(data) {
  const db = getDb();
  const hash = bcrypt.hashSync(data.password, 10);
  const info = db.prepare(`
    INSERT INTO staff (name, email, password, role, isActive)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.name, data.email, hash, data.role || 'staff', 1);
  return getStaffById(info.lastInsertRowid);
}

function updateStaff(id, data) {
  const db = getDb();
  const fields = [];
  const values = [];

  if (data.name)     { fields.push('name = ?');     values.push(data.name); }
  if (data.role)     { fields.push('role = ?');     values.push(data.role); }
  if (data.isActive !== undefined) { fields.push('isActive = ?'); values.push(data.isActive ? 1 : 0); }
  if (data.password) { fields.push('password = ?'); values.push(bcrypt.hashSync(data.password, 10)); }
  if (data.pin !== undefined) { fields.push('pin = ?'); values.push(data.pin || null); }
  if (!fields.length) return getStaffById(id);

  values.push(id);
  db.prepare(`UPDATE staff SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getStaffById(id);
}

function _stripPassword(row) {
  const { password, ...safe } = row;
  return { ...safe, isActive: Boolean(safe.isActive) };
}

// ── Settings helpers ──────────────────────────────────────────────────────────

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function setSetting(key, value) {
  getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value));
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT * FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

function getTodayStats() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const lastWeekSameDay = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const todayOrders  = db.prepare(
    "SELECT * FROM orders WHERE createdAt LIKE ?"
  ).all(`${today}%`);
  const lastWeekOrders = db.prepare(
    "SELECT * FROM orders WHERE createdAt LIKE ?"
  ).all(`${lastWeekSameDay}%`);

  const sumRevenue = (orders) => orders.reduce((s, o) => s + o.totalAmount, 0);
  const pending    = todayOrders.filter(o => !['delivered','cancelled'].includes(o.status));

  const todayRevenue  = sumRevenue(todayOrders);
  const lwRevenue     = sumRevenue(lastWeekOrders);
  const revenueChange = lwRevenue === 0 ? null
    : Math.round(((todayRevenue - lwRevenue) / lwRevenue) * 100);

  const activeStaff = db.prepare(
    "SELECT COUNT(*) AS n FROM staff WHERE isActive = 1"
  ).get().n;

  // Unique customers by phone
  const uniqueCustomers = new Set(
    todayOrders.map(o => JSON.parse(o.customer).phone)
  ).size;

  return {
    revenue: todayRevenue,           // cents
    revenueChange,
    pendingOrders: pending.length,
    activeStaff,
    totalCustomers: uniqueCustomers,
  };
}

function getSalesTrend(days = 7) {
  const db = getDb();
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const row = db.prepare(
      "SELECT COALESCE(SUM(totalAmount),0) AS revenue, COUNT(*) AS orders FROM orders WHERE createdAt LIKE ?"
    ).get(`${d}%`);
    result.push({ date: d, revenue: row.revenue, orders: row.orders });
  }
  return result;
}

function getTopItems(limit = 10) {
  const db = getDb();
  // items column is JSON array; SQLite json_each iterates it
  return db.prepare(`
    SELECT
      json_extract(value, '$.id')       AS itemId,
      json_extract(value, '$.title')    AS title,
      SUM(json_extract(value, '$.quantity')) AS totalSold,
      SUM(json_extract(value, '$.price') * json_extract(value, '$.quantity')) AS totalRevenue
    FROM orders, json_each(orders.items)
    GROUP BY itemId, title
    ORDER BY totalSold DESC
    LIMIT ?
  `).all(limit);
}

function getHourlySales() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    SELECT
      CAST(strftime('%H', createdAt) AS INTEGER) AS hour,
      COALESCE(SUM(totalAmount), 0) AS revenue,
      COUNT(*) AS orders
    FROM orders
    WHERE createdAt LIKE ?
    GROUP BY hour
    ORDER BY hour
  `).all(`${today}%`);
}

// ── Customer helpers ─────────────────────────────────────────────────────────

function getCustomerByPhone(phone) {
  return getDb().prepare('SELECT * FROM customers WHERE phone = ?').get(phone) || null;
}

function createCustomer({ name, phone, email }) {
  const db = getDb();
  const info = db.prepare(
    'INSERT OR IGNORE INTO customers (name, phone, email) VALUES (?, ?, ?)'
  ).run(name || '', phone, email || '');
  if (info.changes === 0) return getCustomerByPhone(phone);
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  // init loyalty row
  db.prepare('INSERT OR IGNORE INTO loyalty (customerId) VALUES (?)').run(cust.id);
  return cust;
}

function searchCustomers(query) {
  const like = `%${query}%`;
  return getDb().prepare(
    'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY createdAt DESC LIMIT 20'
  ).all(like, like);
}

function getLoyaltyByPhone(phone) {
  const db = getDb();
  const cust = getCustomerByPhone(phone);
  if (!cust) return null;
  const loy = db.prepare('SELECT * FROM loyalty WHERE customerId = ?').get(cust.id);
  return { ...cust, ...(loy || {}), loyaltyConfig: getSetting('loyalty') || {} };
}

function addLoyaltyPoints(phone, spentCents) {
  const db = getDb();
  const config = getSetting('loyalty') || { pointsPerDollar: 1 };
  const earned = Math.floor((spentCents / 100) * config.pointsPerDollar);
  if (earned <= 0) return;
  const cust = getCustomerByPhone(phone);
  if (!cust) return;
  db.prepare('INSERT OR IGNORE INTO loyalty (customerId) VALUES (?)').run(cust.id);
  db.prepare(`
    UPDATE loyalty
    SET points = points + ?, lifetimePoints = lifetimePoints + ?,
        totalSpent = totalSpent + ?, totalOrders = totalOrders + 1,
        updatedAt = datetime('now')
    WHERE customerId = ?
  `).run(earned, earned, spentCents, cust.id);
}

function redeemLoyaltyPoints(phone, pointsToRedeem) {
  const db = getDb();
  const config = getSetting('loyalty') || { pointsPerRedemption: 100, redemptionValue: 1 };
  const cust = getCustomerByPhone(phone);
  if (!cust) throw new Error('Customer not found');
  const loy = db.prepare('SELECT * FROM loyalty WHERE customerId = ?').get(cust.id);
  if (!loy || loy.points < pointsToRedeem) throw new Error('Insufficient points');
  // each 100 pts = $1 = 100 cents discount
  const discountCents = Math.floor(pointsToRedeem / config.pointsPerRedemption) * (config.redemptionValue * 100);
  db.prepare(
    'UPDATE loyalty SET points = points - ?, updatedAt = datetime(\'now\') WHERE customerId = ?'
  ).run(pointsToRedeem, cust.id);
  return discountCents;
}

// ── Table helpers ─────────────────────────────────────────────────────────────

function getAllTables() {
  return getDb().prepare('SELECT * FROM cafe_tables ORDER BY number').all();
}

function updateTableStatus(id, status) {
  const info = getDb().prepare('UPDATE cafe_tables SET status = ? WHERE id = ?').run(status, id);
  return info.changes > 0;
}

function createCafeTable({ number, capacity }) {
  const db = getDb();
  const info = db.prepare('INSERT INTO cafe_tables (number, capacity) VALUES (?, ?)').run(number, capacity || 4);
  return db.prepare('SELECT * FROM cafe_tables WHERE id = ?').get(info.lastInsertRowid);
}

// ── Modifier helpers ──────────────────────────────────────────────────────────

function getAllModifiers() {
  const db = getDb();
  const groups = db.prepare('SELECT * FROM modifiers ORDER BY id').all();
  const options = db.prepare('SELECT * FROM modifier_options ORDER BY id').all();
  return groups.map(g => ({ ...g, required: Boolean(g.required), multiSelect: Boolean(g.multiSelect), options: options.filter(o => o.modifierId === g.id) }));
}

function getProductModifiers(productId) {
  const db = getDb();
  const ids = db.prepare('SELECT modifierId FROM product_modifiers WHERE productId = ?').all(productId).map(r => r.modifierId);
  if (ids.length === 0) return [];
  const all = getAllModifiers();
  return all.filter(m => ids.includes(m.id));
}

function linkModifierToProduct(productId, modifierId) {
  getDb().prepare('INSERT OR IGNORE INTO product_modifiers (productId, modifierId) VALUES (?, ?)').run(productId, modifierId);
}

function unlinkModifierFromProduct(productId, modifierId) {
  getDb().prepare('DELETE FROM product_modifiers WHERE productId = ? AND modifierId = ?').run(productId, modifierId);
}

function createModifier({ name, required, multiSelect }) {
  const db = getDb();
  const info = db.prepare('INSERT INTO modifiers (name, required, multiSelect) VALUES (?, ?, ?)').run(name, required ? 1 : 0, multiSelect ? 1 : 0);
  return db.prepare('SELECT * FROM modifiers WHERE id = ?').get(info.lastInsertRowid);
}

function addModifierOption(modifierId, label, priceAdjustment) {
  const db = getDb();
  const info = db.prepare('INSERT INTO modifier_options (modifierId, label, priceAdjustment) VALUES (?, ?, ?)').run(modifierId, label, priceAdjustment || 0);
  return db.prepare('SELECT * FROM modifier_options WHERE id = ?').get(info.lastInsertRowid);
}

function deleteModifier(id) {
  const db = getDb();
  db.prepare('DELETE FROM modifier_options WHERE modifierId = ?').run(id);
  db.prepare('DELETE FROM product_modifiers WHERE modifierId = ?').run(id);
  const info = db.prepare('DELETE FROM modifiers WHERE id = ?').run(id);
  return info.changes > 0;
}

function getMenuItemByBarcode(barcode) {
  return getDb().prepare('SELECT * FROM menu_items WHERE barcode = ? AND isAvailable = 1').get(barcode) || null;
}

// ── Inventory helpers ─────────────────────────────────────────────────────────

function getInventory() {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, m.title as productName, m.categoryId
    FROM inventory i
    JOIN menu_items m ON m.id = i.productId
    ORDER BY m.title
  `).all();
}

function getInventoryByProduct(productId) {
  return getDb().prepare('SELECT * FROM inventory WHERE productId = ?').get(productId) || null;
}

function upsertInventory(productId, quantity, unit, lowStockThreshold) {
  const db = getDb();
  db.prepare(`
    INSERT INTO inventory (productId, quantity, unit, lowStockThreshold, updatedAt)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(productId) DO UPDATE SET
      quantity = excluded.quantity,
      unit = excluded.unit,
      lowStockThreshold = excluded.lowStockThreshold,
      updatedAt = datetime('now')
  `).run(productId, quantity, unit || 'units', lowStockThreshold || 5);
  return getInventoryByProduct(productId);
}

function adjustStock(productId, type, qty, reason, staffId) {
  const db = getDb();
  const cur = db.prepare('SELECT quantity FROM inventory WHERE productId = ?').get(productId);
  const current = cur ? cur.quantity : 0;
  let newQty;
  if (type === 'in') newQty = current + qty;
  else if (type === 'out') newQty = Math.max(0, current - qty);
  else newQty = qty; // 'adjust'

  db.prepare(`
    INSERT INTO inventory (productId, quantity, updatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(productId) DO UPDATE SET quantity = ?, updatedAt = datetime('now')
  `).run(productId, newQty, newQty);

  db.prepare('INSERT INTO stock_movements (productId, type, qty, reason, staffId) VALUES (?, ?, ?, ?, ?)').run(productId, type, qty, reason || '', staffId || null);
  return getInventoryByProduct(productId);
}

function getStockMovements(productId, limit) {
  const db = getDb();
  const q = productId
    ? db.prepare('SELECT sm.*, m.title as productName FROM stock_movements sm JOIN menu_items m ON m.id = sm.productId WHERE sm.productId = ? ORDER BY sm.createdAt DESC LIMIT ?').all(productId, limit || 50)
    : db.prepare('SELECT sm.*, m.title as productName FROM stock_movements sm JOIN menu_items m ON m.id = sm.productId ORDER BY sm.createdAt DESC LIMIT ?').all(limit || 100);
  return q;
}

// ── Supplier helpers ──────────────────────────────────────────────────────────

function getAllSuppliers() {
  return getDb().prepare('SELECT * FROM suppliers ORDER BY name').all();
}

function createSupplier({ name, phone, email, address, notes }) {
  const db = getDb();
  const info = db.prepare('INSERT INTO suppliers (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)').run(name, phone || '', email || '', address || '', notes || '');
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid);
}

function updateSupplier(id, data) {
  const db = getDb();
  const fields = ['name','phone','email','address','notes'].filter(k => data[k] !== undefined);
  if (!fields.length) return null;
  db.prepare(`UPDATE suppliers SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(f => data[f]), id);
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}

function deleteSupplier(id) {
  return getDb().prepare('DELETE FROM suppliers WHERE id = ?').run(id).changes > 0;
}

// ── Purchase Order helpers ────────────────────────────────────────────────────

function getAllPurchaseOrders(supplierId) {
  const db = getDb();
  const base = `SELECT po.*, s.name as supplierName FROM purchase_orders po JOIN suppliers s ON s.id = po.supplierId`;
  const rows = supplierId
    ? db.prepare(base + ' WHERE po.supplierId = ? ORDER BY po.createdAt DESC').all(supplierId)
    : db.prepare(base + ' ORDER BY po.createdAt DESC').all();
  return rows.map(r => ({ ...r, items: JSON.parse(r.items) }));
}

function createPurchaseOrder({ supplierId, items, totalAmount, notes }) {
  const db = getDb();
  const info = db.prepare('INSERT INTO purchase_orders (supplierId, items, totalAmount, notes) VALUES (?, ?, ?, ?)').run(supplierId, JSON.stringify(items || []), totalAmount || 0, notes || '');
  return db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(info.lastInsertRowid);
}

function receivePurchaseOrder(id, staffId) {
  const db = getDb();
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
  if (!po || po.status === 'received') return null;
  const items = JSON.parse(po.items || '[]');
  for (const item of items) {
    if (item.productId) adjustStock(item.productId, 'in', item.qty, `PO #${id}`, staffId);
  }
  db.prepare("UPDATE purchase_orders SET status = 'received', receivedAt = datetime('now') WHERE id = ?").run(id);
  return db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
}

function cancelPurchaseOrder(id) {
  return getDb().prepare("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(id).changes > 0;
}

// ── Promotion helpers ─────────────────────────────────────────────────────────

function getAllPromotions() {
  return getDb().prepare('SELECT * FROM promotions ORDER BY createdAt DESC').all()
    .map(p => ({ ...p, isActive: Boolean(p.isActive) }));
}

function createPromotion({ code, type, value, minOrder, maxUses, expiresAt }) {
  const db = getDb();
  const info = db.prepare('INSERT INTO promotions (code, type, value, minOrder, maxUses, expiresAt) VALUES (?, ?, ?, ?, ?, ?)').run(code, type || 'flat', value || 0, minOrder || 0, maxUses || 0, expiresAt || null);
  return db.prepare('SELECT * FROM promotions WHERE id = ?').get(info.lastInsertRowid);
}

function updatePromotion(id, data) {
  const db = getDb();
  const allowed = ['code','type','value','minOrder','maxUses','expiresAt','isActive'];
  const fields = allowed.filter(k => data[k] !== undefined);
  if (!fields.length) return null;
  db.prepare(`UPDATE promotions SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(f => data[f]), id);
  return db.prepare('SELECT * FROM promotions WHERE id = ?').get(id);
}

function deletePromotion(id) {
  return getDb().prepare('DELETE FROM promotions WHERE id = ?').run(id).changes > 0;
}

function validatePromoCode(code, orderTotalCents) {
  const db = getDb();
  const promo = db.prepare('SELECT * FROM promotions WHERE code = ? COLLATE NOCASE AND isActive = 1').get(code);
  if (!promo) return { valid: false, reason: 'Promo code not found.' };
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return { valid: false, reason: 'Promo code has expired.' };
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) return { valid: false, reason: 'Promo code usage limit reached.' };
  if (promo.minOrder > 0 && orderTotalCents < promo.minOrder) return { valid: false, reason: `Minimum order $${(promo.minOrder/100).toFixed(2)} required.` };
  const discountCents = promo.type === 'percent' ? Math.round((promo.value / 100) * orderTotalCents) : promo.value;
  return { valid: true, promo, discountCents };
}

function incrementPromoUsage(id) {
  getDb().prepare('UPDATE promotions SET usedCount = usedCount + 1 WHERE id = ?').run(id);
}

// ── Shift helpers ─────────────────────────────────────────────────────────────

function getOpenShift(staffId) {
  const db = getDb();
  const q = staffId
    ? db.prepare("SELECT * FROM shifts WHERE status = 'open' AND staffId = ? ORDER BY openedAt DESC LIMIT 1").get(staffId)
    : db.prepare("SELECT * FROM shifts WHERE status = 'open' ORDER BY openedAt DESC LIMIT 1").get();
  return q || null;
}

function getAllShifts(limit) {
  return getDb().prepare(`
    SELECT s.*, st.name as staffName
    FROM shifts s JOIN staff st ON st.id = s.staffId
    ORDER BY s.openedAt DESC LIMIT ?
  `).all(limit || 50);
}

function openShift(staffId, openingFloat) {
  const db = getDb();
  const existing = getOpenShift(staffId);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO shifts (staffId, openingFloat) VALUES (?, ?)').run(staffId, openingFloat || 0);
  return db.prepare('SELECT * FROM shifts WHERE id = ?').get(info.lastInsertRowid);
}

function closeShift(shiftId, closingFloat, notes) {
  const db = getDb();
  db.prepare("UPDATE shifts SET status = 'closed', closedAt = datetime('now'), closingFloat = ?, notes = ? WHERE id = ?").run(closingFloat || 0, notes || '', shiftId);
  return db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
}

function addCashMovement(shiftId, type, amount, reason) {
  const db = getDb();
  const info = db.prepare('INSERT INTO cash_movements (shiftId, type, amount, reason) VALUES (?, ?, ?, ?)').run(shiftId, type, amount, reason || '');
  return db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(info.lastInsertRowid);
}

function getShiftMovements(shiftId) {
  return getDb().prepare('SELECT * FROM cash_movements WHERE shiftId = ? ORDER BY createdAt').all(shiftId);
}

function getShiftSales(shiftId) {
  const db = getDb();
  return db.prepare("SELECT SUM(totalAmount) as total, COUNT(*) as count FROM orders WHERE shiftId = ? AND status != 'cancelled'").get(shiftId) || { total: 0, count: 0 };
}

// ── Audit log helpers ─────────────────────────────────────────────────────────

function addAuditLog({ staffId, staffName, action, entity, entityId, details }) {
  getDb().prepare('INSERT INTO audit_logs (staffId, staffName, action, entity, entityId, details) VALUES (?, ?, ?, ?, ?, ?)').run(staffId || null, staffName || 'System', action, entity, entityId || null, JSON.stringify(details || {}));
}

function getAuditLogs({ entity, limit, offset } = {}) {
  const db = getDb();
  const where = entity ? `WHERE entity = '${entity}'` : '';
  return db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`).all(limit || 50, offset || 0);
}

// ── Reports helpers ───────────────────────────────────────────────────────────

function getSalesReport({ from, to }) {
  const db = getDb();
  const fromStr = from || '2000-01-01';
  const toStr = to || '2099-12-31';
  const rows = db.prepare(`
    SELECT
      date(createdAt) as date,
      COUNT(*) as orderCount,
      SUM(totalAmount) as revenue,
      SUM(discountAmount) as discounts
    FROM orders
    WHERE date(createdAt) BETWEEN ? AND ? AND status != 'cancelled'
    GROUP BY date(createdAt)
    ORDER BY date(createdAt)
  `).all(fromStr, toStr);
  return rows;
}

function getProductPerformance({ from, to, limit }) {
  const db = getDb();
  const fromStr = from || '2000-01-01';
  const toStr = to || '2099-12-31';
  const orders = db.prepare(`SELECT items FROM orders WHERE date(createdAt) BETWEEN ? AND ? AND status != 'cancelled'`).all(fromStr, toStr);
  const map = {};
  for (const o of orders) {
    const items = JSON.parse(o.items || '[]');
    for (const item of items) {
      if (!map[item.title]) map[item.title] = { title: item.title, qty: 0, revenue: 0 };
      map[item.title].qty += item.quantity;
      map[item.title].revenue += item.price * item.quantity;
    }
  }
  return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, limit || 20);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  getDb,
  // Orders
  loadOrders, getOrderById, saveOrder, updateOrderStatus, clearAllOrders,
  // Menu
  getMenuItems, getMenuItemById, createMenuItem, updateMenuItem, deleteMenuItem,
  // Categories
  getCategories, createCategory, deleteCategory,
  // Staff
  getAllStaff, getStaffById, getStaffByEmail, getStaffByPin, createStaff, updateStaff,
  // Settings
  getSetting, setSetting, getAllSettings,
  // Analytics
  getTodayStats, getSalesTrend, getTopItems, getHourlySales,
  // Customers & Loyalty
  getCustomerByPhone, createCustomer, searchCustomers, getLoyaltyByPhone, addLoyaltyPoints, redeemLoyaltyPoints,
  // Tables
  getAllTables, updateTableStatus, createCafeTable,
  // Modifiers
  getAllModifiers, getProductModifiers, linkModifierToProduct, unlinkModifierFromProduct,
  createModifier, addModifierOption, deleteModifier, getMenuItemByBarcode,
  // Inventory
  getInventory, getInventoryByProduct, upsertInventory, adjustStock, getStockMovements,
  // Suppliers
  getAllSuppliers, createSupplier, updateSupplier, deleteSupplier,
  // Purchase Orders
  getAllPurchaseOrders, createPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder,
  // Promotions
  getAllPromotions, createPromotion, updatePromotion, deletePromotion, validatePromoCode, incrementPromoUsage,
  // Shifts
  getOpenShift, getAllShifts, openShift, closeShift, addCashMovement, getShiftMovements, getShiftSales,
  // Audit
  addAuditLog, getAuditLogs,
  // Reports
  getSalesReport, getProductPerformance,
};
