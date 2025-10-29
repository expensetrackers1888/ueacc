const Expense = require('../models/Expense');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const path = require('path');

// === Multer Configuration for File Upload ===
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images and PDFs are allowed'));
  },
});

exports.upload = upload.single('file');

// === Currency Conversion Helper ===
const convertCurrency = (amount, targetCurrency) => {
  const rates = {
    INR: 1,
    USD: 0.012, // 1 INR = 0.012 USD
    ZMW: 0.31,  // 1 INR = 0.31 ZMW
  };
  return (amount * (rates[targetCurrency] || 1)).toFixed(2);
};

// === GET: All Expenses (Admin Only) ===
exports.getAllExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find().populate('user', 'email').lean();
    res.status(200).json({
      status: 'success',
      results: expenses.length,
      data: { expenses },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// === POST: Add New Expense ===
exports.addExpense = async (req, res) => {
  try {
    const { description, amount, date, category, otherType, currency, details } = req.body;
    const file = req.file ? `/uploads/${req.file.filename}` : null;

    if (!description || !amount || !date || !category) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide description, amount, date, and category',
      });
    }

    const expense = await Expense.create({
      description,
      amount: parseFloat(amount),
      date: new Date(date),
      category,
      otherType: otherType || '',
      currency: currency || 'INR',
      file,
      details: details ? JSON.parse(details) : [],
      user: req.user.id,
      status: 'Pending',
    });

    const populated = await Expense.findById(expense._id).populate('user', 'email').lean();

    res.status(201).json({
      status: 'success',
      data: { expense: populated },
    });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// === PUT: Edit Expense (Only Pending & Own) ===
exports.editExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, date, category, otherType, currency, details } = req.body;

    const expense = await Expense.findById(id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    if (expense.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (expense.status !== 'Pending') {
      return res.status(400).json({ message: 'Only pending expenses can be edited' });
    }

    const updates = {
      description,
      amount: parseFloat(amount),
      date: new Date(date),
      category,
      otherType: otherType || '',
      currency: currency || 'INR',
      details: details ? JSON.parse(details) : expense.details,
    };

    if (req.file) updates.file = `/uploads/${req.file.filename}`;

    const updated = await Expense.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).populate('user', 'email').lean();

    res.status(200).json({ status: 'success', data: { expense: updated } });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// === GET: User's Own Expenses ===
exports.getUserExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.user.id })
      .populate('user', 'email')
      .lean();

    res.status(200).json({
      status: 'success',
      results: expenses.length,
      data: { expenses },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// === GET: Admin View of User's Expenses ===
exports.getUserExpensesAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

    const expenses = await Expense.find({ user: userId }).populate('user', 'email').lean();

    res.status(200).json({
      status: 'success',
      results: expenses.length,
      data: { expenses },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// === PATCH: Update Status (Approve/Reject) ===
exports.updateExpenseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectReason } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    if (status === 'Rejected' && !rejectReason) {
      return res.status(400).json({ message: 'Reject reason is required' });
    }

    const updated = await Expense.findByIdAndUpdate(
      id,
      { status, rejectReason: rejectReason || '' },
      { new: true, runValidators: true }
    ).populate('user', 'email').lean();

    if (!updated) return res.status(404).json({ message: 'Expense not found' });

    res.status(200).json({ status: 'success', data: { expense: updated } });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// === DELETE: Delete Pending Expense ===
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    if (expense.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (expense.status !== 'Pending') {
      return res.status(400).json({ message: 'Only pending expenses can be deleted' });
    }

    await Expense.findByIdAndDelete(id);
    res.status(204).json({ status: 'success', data: null });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// === GET: Admin Dashboard Stats ===
exports.getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });

    const totalExpenses = await Expense.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const pendingExpenses = await Expense.countDocuments({ status: 'Pending' });

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const daily = await Expense.aggregate([
      { $match: { date: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const weekly = await Expense.aggregate([
      { $match: { date: { $gte: startOfWeek } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const monthly = await Expense.aggregate([
      { $match: { date: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const totalAmount = totalExpenses[0]?.total || 0;

    const stats = {
      totalUsers,
      totalExpenses: {
        INR: totalAmount.toFixed(2),
        USD: convertCurrency(totalAmount, 'USD'),
        ZMW: convertCurrency(totalAmount, 'ZMW'),
      },
      pendingExpenses,
      dailyExpenses: {
        INR: (daily[0]?.total || 0).toFixed(2),
        USD: convertCurrency(daily[0]?.total || 0, 'USD'),
        ZMW: convertCurrency(daily[0]?.total || 0, 'ZMW'),
      },
      weeklyExpenses: {
        INR: (weekly[0]?.total || 0).toFixed(2),
        USD: convertCurrency(weekly[0]?.total || 0, 'USD'),
        ZMW: convertCurrency(weekly[0]?.total || 0, 'ZMW'),
      },
      monthlyExpenses: {
        INR: (monthly[0]?.total || 0).toFixed(2),
        USD: convertCurrency(monthly[0]?.total || 0, 'USD'),
        ZMW: convertCurrency(monthly[0]?.total || 0, 'ZMW'),
      },
    };

    res.status(200).json({ status: 'success', data: { stats } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// === GET: Generate PDF Report for User ===
exports.generateUserExpensesPDF = async (req, res) => {
  try {
    // CORS Headers
    const allowedOrigins = ['http://localhost:3000', 'https://ueacc.com'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Accept');

    const { userId } = req.params;
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const expenses = await Expense.find({ user: userId }).lean();
    if (expenses.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No expenses found' });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const sanitizedEmail = user.email.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${sanitizedEmail}_expenses_report.pdf`);

    doc.pipe(res);

    // === Header ===
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#1f2937')
      .text('Expense Report', { align: 'center' });

    doc
      .fontSize(14)
      .fillColor('#4b5563')
      .text(`User: ${user.email}`, { align: 'center' });

    doc
      .fontSize(12)
      .text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });

    doc.moveDown(2);

    // === Table Config ===
    const tableTop = doc.y;
    const table = {
      x: 50,
      width: 495,
      colWidths: [180, 70, 50, 75, 70, 50],
      rowHeight: 25,
      headerHeight: 30,
    };

    const headers = ['Description', 'Amount', 'Curr.', 'Date', 'Category', 'Status'];
    const colX = [...table.colWidths];

    // Draw Header
    doc.rect(table.x, tableTop, table.width, table.headerHeight).fill('#e5e7eb').stroke('#d1d5db');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937');

    let xPos = table.x + 8;
    headers.forEach((h, i) => {
      const align = i === 1 ? 'right' : i >= 2 ? 'center' : 'left';
      doc.text(h, xPos, tableTop + 9, { width: table.colWidths[i], align });
      xPos += table.colWidths[i];
    });

    // Draw Rows
    let yPos = tableTop + table.headerHeight;
    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
    const currency = expenses[0].currency || 'INR';

    expenses.forEach((exp, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      doc.rect(table.x, yPos, table.width, table.rowHeight).fill(bg).stroke('#d1d5db');

      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      xPos = table.x + 8;

      const desc = exp.description.length > 35 ? exp.description.substring(0, 32) + '...' : exp.description;

      doc.text(desc, xPos, yPos + 7, { width: table.colWidths[0] });
      xPos += table.colWidths[0];
      doc.text(exp.amount.toFixed(2), xPos, yPos + 7, { width: table.colWidths[1], align: 'right' });
      xPos += table.colWidths[1];
      doc.text(exp.currency, xPos, yPos + 7, { width: table.colWidths[2], align: 'center' });
      xPos += table.colWidths[2];
      doc.text(new Date(exp.date).toLocaleDateString(), xPos, yPos + 7, { width: table.colWidths[3], align: 'center' });
      xPos += table.colWidths[3];
      doc.text(exp.category, xPos, yPos + 7, { width: table.colWidths[4], align: 'center' });
      xPos += table.colWidths[4];
      doc.text(exp.status, xPos, yPos + 7, { width: table.colWidths[5], align: 'center' });

      yPos += table.rowHeight;
    });

    // === Total Row ===
    const totalY = yPos + 10;
    doc.rect(table.x, totalY, table.width, 30).fill('#e5e7eb').stroke('#d1d5db');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2937');
    doc.text('TOTAL', table.x + 8, totalY + 9, { width: table.colWidths[0] + table.colWidths[1] + table.colWidths[2] });
    doc.text(`${totalAmount.toFixed(2)} ${currency}`, table.x + table.colWidths[0] + table.colWidths[1] + table.colWidths[2] + 8, totalY + 9, {
      width: table.colWidths[3] + table.colWidths[4] + table.colWidths[5],
      align: 'right',
    });

    doc.moveDown(2);
    doc.fontSize(10).fillColor('#6b7280').text('End of Report', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('PDF Generation Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: 'Failed to generate PDF' });
    }
  }
};

module.exports = exports;