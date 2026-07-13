const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const ORDERS_FILE = path.join(__dirname, 'orders.json');

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ── Helpers ─────────────────────────────────────────────────────────────────
function loadOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

function generateOrderId() {
  const prefix = 'ZZC';
  const timestamp = Date.now().toString().slice(-5);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/orders — Place a new order
app.post('/api/orders', (req, res) => {
  const { customer, orderType, items, paymentMethod, notes, totalAmount } = req.body;

  // Basic validation
  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart is empty.' });
  }
  if (!customer?.phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }
  if (orderType === 'dine-in' && !customer?.tableNumber) {
    return res.status(400).json({ success: false, message: 'Table number is required for dine-in.' });
  }
  if (orderType === 'delivery' && !customer?.address) {
    return res.status(400).json({ success: false, message: 'Delivery address is required.' });
  }

  const order = {
    id: generateOrderId(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    customer,
    orderType,
    items,
    paymentMethod,
    notes: notes || '',
    totalAmount,
  };

  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);

  console.log(`\n✅ New order received: ${order.id}`);
  console.log(`   Type: ${order.orderType} | Payment: ${order.paymentMethod}`);
  console.log(`   Customer: ${order.customer.phone}`);
  console.log(`   Items: ${order.items.map(i => `${i.quantity}x ${i.title}`).join(', ')}`);
  console.log(`   Total: $${order.totalAmount}`);

  return res.status(201).json({
    success: true,
    message: 'Order placed successfully!',
    order: {
      id: order.id,
      status: order.status,
      estimatedTime: orderType === 'delivery' ? '30-45 min' : '10-15 min',
    },
  });
});

// GET /api/orders — Retrieve all orders (admin view)
app.get('/api/orders', (req, res) => {
  const orders = loadOrders();
  return res.json({ success: true, total: orders.length, orders });
});

// GET /api/orders/:id — Get a specific order
app.get('/api/orders/:id', (req, res) => {
  const orders = loadOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }
  return res.json({ success: true, order });
});

// PATCH /api/orders/:id/status — Update order status
app.patch('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }

  const orders = loadOrders();
  const index = orders.findIndex(o => o.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }

  orders[index].status = status;
  orders[index].updatedAt = new Date().toISOString();
  saveOrders(orders);

  return res.json({ success: true, order: orders[index] });
});

// DELETE /api/orders — Clear all orders (dev use)
app.delete('/api/orders', (req, res) => {
  saveOrders([]);
  return res.json({ success: true, message: 'All orders cleared.' });
});

// Health check
app.get('/api/health', (req, res) => {
  const orders = loadOrders();
  res.json({ status: 'ok', totalOrders: orders.length, timestamp: new Date().toISOString() });
});

// ── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 ZamZam Cafe Backend running at http://localhost:${PORT}`);
  console.log(`   POST /api/orders       — Place a new order`);
  console.log(`   GET  /api/orders       — View all orders`);
  console.log(`   GET  /api/orders/:id   — View a specific order`);
  console.log(`   PATCH /api/orders/:id/status — Update order status`);
  console.log(`   GET  /api/health       — Server health check\n`);
});
