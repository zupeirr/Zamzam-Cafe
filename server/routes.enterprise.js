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
