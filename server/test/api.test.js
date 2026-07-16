'use strict';
process.env.NODE_ENV = 'test';
const test    = require('node:test');
const assert  = require('node:assert');
const request = require('supertest');
const app     = require('../index');
const db      = require('../database');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Log in as the seeded owner and return a Bearer token */
async function getOwnerToken() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@auracoffee.com', password: 'admin_password_123' });
  assert.strictEqual(res.body.success, true, 'Owner login should succeed');
  return res.body.token;
}

// Clear orders + dynamically-created staff before every test
test.beforeEach(() => {
  const rawDb = db.getDb();
  rawDb.exec('DELETE FROM orders');
  // Remove any staff created during tests (keep the seeded owner)
  rawDb.exec("DELETE FROM staff WHERE email != 'admin@auracoffee.com'");
});

// ════════════════════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════════════════════

test('POST /api/auth/login — valid credentials', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@auracoffee.com', password: 'admin_password_123' })
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.token, 'Should return a token');
  assert.strictEqual(res.body.staff.role, 'owner');
});

test('POST /api/auth/login — wrong password → 401', async () => {
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@auracoffee.com', password: 'wrong' })
    .expect(401);
});

test('GET /api/auth/me — returns own profile', async () => {
  const token = await getOwnerToken();
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.strictEqual(res.body.staff.email, 'admin@auracoffee.com');
});

test('GET /api/auth/me — no token → 401', async () => {
  await request(app).get('/api/auth/me').expect(401);
});

// ════════════════════════════════════════════════════════════════════════════
//  MENU & CATEGORIES
// ════════════════════════════════════════════════════════════════════════════

test('GET /api/categories — public, returns seeded categories', async () => {
  const res = await request(app).get('/api/categories').expect(200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.categories.length >= 6);
});

test('GET /api/products — public, returns seeded items', async () => {
  const res = await request(app).get('/api/products').expect(200);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.items.length >= 54);
  // Prices should be integers (cents)
  for (const item of res.body.items) {
    assert.strictEqual(typeof item.price, 'number');
    assert.ok(Number.isInteger(item.price), `price of "${item.title}" should be integer cents`);
  }
});

test('GET /api/products?category=HotDrinks — filters correctly', async () => {
  const res = await request(app).get('/api/products?category=HotDrinks').expect(200);
  assert.ok(res.body.items.length > 0);
  for (const item of res.body.items) {
    assert.strictEqual(item.categoryId, 'HotDrinks');
  }
});

test('POST /api/menu — create item (auth required)', async () => {
  const token = await getOwnerToken();
  const res = await request(app)
    .post('/api/menu')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Test Drink', price: 150, categoryId: 'HotDrinks', description: 'Test' })
    .expect(201);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.item.price, 150); // cents
  assert.strictEqual(res.body.item.title, 'Test Drink');
});

test('POST /api/menu — no auth → 401', async () => {
  await request(app)
    .post('/api/menu')
    .send({ title: 'Test', price: 100, categoryId: 'HotDrinks' })
    .expect(401);
});

test('PATCH /api/menu/:id — update price (auth)', async () => {
  const token = await getOwnerToken();
  // Create a test item first
  const create = await request(app)
    .post('/api/menu')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'UpdateMe', price: 100, categoryId: 'HotDrinks' });

  const id = create.body.item.id;
  const res = await request(app)
    .patch(`/api/menu/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ price: 250 })
    .expect(200);

  assert.strictEqual(res.body.item.price, 250);
});

test('DELETE /api/menu/:id (auth)', async () => {
  const token = await getOwnerToken();
  const create = await request(app)
    .post('/api/menu')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'DeleteMe', price: 100, categoryId: 'HotDrinks' });

  await request(app)
    .delete(`/api/menu/${create.body.item.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
});

// ════════════════════════════════════════════════════════════════════════════
//  ORDERS  (price validation — integer cents)
// ════════════════════════════════════════════════════════════════════════════

test('POST /api/orders — success with integer-cent prices', async () => {
  // Get a real item from the DB
  const items = db.getMenuItems({ categoryId: 'HotDrinks' });
  const item  = items[0]; // e.g. Espresso = 71¢

  const subtotal = item.price * 2;          // 142¢
  const total    = subtotal;                // dine-in, no delivery fee

  const res = await request(app)
    .post('/api/orders')
    .send({
      customer: { fullName: 'Test User', phone: '0612345678', tableNumber: '3' },
      orderType: 'dine-in',
      items: [{ id: item.id, title: item.title, price: item.price, quantity: 2 }],
      paymentMethod: 'cash',
      totalAmount: total,
    })
    .expect(201);

  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.order.id.startsWith('ZZC-'));

  // Persisted in DB with cents
  const saved = db.getOrderById(res.body.order.id);
  assert.strictEqual(saved.totalAmount, total);
});

test('POST /api/orders — price tamper rejected', async () => {
  const items   = db.getMenuItems({ categoryId: 'HotDrinks' });
  const item    = items[0]; // e.g. 71¢
  const tampered = 1;       // 1¢ — should be rejected

  const res = await request(app)
    .post('/api/orders')
    .send({
      customer: { phone: '0612345678', tableNumber: '1' },
      orderType: 'dine-in',
      items: [{ id: item.id, title: item.title, price: tampered, quantity: 1 }],
      paymentMethod: 'cash',
      totalAmount: tampered,
    })
    .expect(400);

  assert.match(res.body.message, /[Pp]rice mismatch/);
});

test('POST /api/orders — delivery fee added server-side', async () => {
  const items = db.getMenuItems({ categoryId: 'HotDrinks' });
  const item  = items[0];  // e.g. 71¢

  const subtotal    = item.price;     // 71¢
  const correctTotal = subtotal + 200; // + 200¢ delivery

  const res = await request(app)
    .post('/api/orders')
    .send({
      customer: { phone: '0612345678', address: '123 Main St' },
      orderType: 'delivery',
      items: [{ id: item.id, title: item.title, price: item.price, quantity: 1 }],
      paymentMethod: 'cash',
      totalAmount: correctTotal,
    })
    .expect(201);

  const saved = db.getOrderById(res.body.order.id);
  assert.strictEqual(saved.totalAmount, correctTotal);
});

// ════════════════════════════════════════════════════════════════════════════
//  STAFF (owner-protected)
// ════════════════════════════════════════════════════════════════════════════

test('GET /api/staff — owner can list staff', async () => {
  const token = await getOwnerToken();
  const res = await request(app)
    .get('/api/staff')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.staff.length >= 1);
  // Password should never be returned
  for (const s of res.body.staff) {
    assert.strictEqual(s.password, undefined, 'Password must not be returned');
  }
});

test('POST /api/staff — create staff member (owner)', async () => {
  const token = await getOwnerToken();
  const res = await request(app)
    .post('/api/staff')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Barista Bob', email: 'bob@test.com', password: 'secret123', role: 'staff' })
    .expect(201);

  assert.strictEqual(res.body.staff.name, 'Barista Bob');
  assert.strictEqual(res.body.staff.role, 'staff');

  // Bob can log in
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'bob@test.com', password: 'secret123' })
    .expect(200);
  assert.ok(login.body.token);
});

test('GET /api/staff — non-owner JWT → 403', async () => {
  const ownerToken = await getOwnerToken();
  // Create a staff member
  await request(app)
    .post('/api/staff')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: 'Alice', email: 'alice@test.com', password: 'pw', role: 'staff' });

  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'alice@test.com', password: 'pw' });

  await request(app)
    .get('/api/staff')
    .set('Authorization', `Bearer ${staffLogin.body.token}`)
    .expect(403);
});

// ════════════════════════════════════════════════════════════════════════════
//  ANALYTICS
// ════════════════════════════════════════════════════════════════════════════

test('GET /api/analytics/today — returns stats object', async () => {
  const token = await getOwnerToken();
  const res = await request(app)
    .get('/api/analytics/today')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const s = res.body.stats;
  assert.ok(typeof s.revenue        === 'number');
  assert.ok(typeof s.pendingOrders  === 'number');
  assert.ok(typeof s.activeStaff    === 'number');
  assert.ok(typeof s.totalCustomers === 'number');
});

test('GET /api/analytics/charts — returns trend + topItems + hourly', async () => {
  const token = await getOwnerToken();
  const res = await request(app)
    .get('/api/analytics/charts?days=7')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.ok(Array.isArray(res.body.salesTrend));
  assert.strictEqual(res.body.salesTrend.length, 7);
  assert.ok(Array.isArray(res.body.topItems));
  assert.ok(Array.isArray(res.body.hourly));
});

// ════════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════════════════════

test('GET /api/settings/cafe — public', async () => {
  const res = await request(app).get('/api/settings/cafe').expect(200);
  assert.ok(res.body.cafe.name);
});

test('PATCH /api/settings/cafe — owner can update', async () => {
  const token = await getOwnerToken();
  const res = await request(app)
    .patch('/api/settings/cafe')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Updated Cafe Name' })
    .expect(200);

  assert.strictEqual(res.body.cafe.name, 'Updated Cafe Name');
});
