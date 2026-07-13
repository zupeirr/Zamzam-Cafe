const http = require('http');

const payload = JSON.stringify({
  customer: { phone: '0612345678', tableNumber: '5' },
  orderType: 'dine-in',
  items: [
    { id: 1, title: 'Espresso', price: '0.71$', quantity: 2 },
    { id: 2, title: 'Cappuccino', price: '0.83$', quantity: 1 }
  ],
  paymentMethod: 'cash',
  notes: 'No sugar please',
  totalAmount: '2.25'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/orders',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('=== POST /api/orders ===');
    console.log(JSON.stringify(json, null, 2));

    // Now fetch all orders
    http.get('http://localhost:3001/api/orders', (res2) => {
      let d = '';
      res2.on('data', c => d += c);
      res2.on('end', () => {
        const orders = JSON.parse(d);
        console.log('\n=== GET /api/orders ===');
        console.log('Total orders: ' + orders.total);
        orders.orders.forEach(o => {
          console.log('  Order ' + o.id + ' | ' + o.orderType + ' | ' + o.status + ' | $' + o.totalAmount + ' | ' + o.createdAt);
        });
      });
    });
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.write(payload);
req.end();
