const Expense = require('../models/Expense');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper: Convert currency
const convertCurrency = (amount, currency) => {
  const rates = { INR: 1, USD: 0.012, ZMW: 0.31 };
  return (amount * rates[currency]).toFixed(2);
};

// Get user's own expenses (pending + approved)
exports.getUserExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.user.id }).sort({ date: -1 });
    res.json({ status: 'success', data: { expenses } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Get approved expenses only
exports.getMyApprovedExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.user.id, status: 'Approved' }).sort({ date: -1 });
    res.json({ status: 'success', data: { expenses } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Add expense (user)
exports.addExpense = async (req, res) => {
  try {
    const { description, amount, date, category, otherType, notes } = req.body;
    const file = req.file;

    const expense = await Expense.create({
      description,
      amount: parseFloat(amount),
      date: new Date(date),
      category,
      otherType: otherType || '',
      notes: notes || '',
      user: req.user.id,
      status: 'Pending',
      file: file ? {
        url: `/uploads/${file.filename}`,
        filename: file.originalname,
        mimetype: file.mimetype,
      } : null,
    });

    res.status(201).json({ status: 'success', data: { expense } });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// Edit approved expense + file
exports.updateApprovedExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes } = req.body;
    const file = req.file;

    const expense = await Expense.findOne({ _id: id, user: req.user.id, status: 'Approved' });
    if (!expense) return res.status(404).json({ message: 'Expense not found or not approved' });

    expense.amount = parseFloat(amount);
    expense.notes = notes || expense.notes;
    if (file) {
      expense.file = {
        url: `/uploads/${file.filename}`,
        filename: file.originalname,
        mimetype: file.mimetype,
      };
    }
    expense.status = 'Pending'; // Re-review
    await expense.save();

    res.json({ status: 'success', data: { expense } });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// Admin: Get all users with total approved
exports.getAdminUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' });
    const usersWithTotal = await Promise.all(users.map(async (user) => {
      const total = await Expense.aggregate([
        { $match: { user: user._id, status: 'Approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      return {
        ...user.toObject(),
        totalApproved: total[0]?.total || 0,
      };
    }));
    res.json({ status: 'success', data: { users: usersWithTotal } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Admin: Get user's expenses
exports.getUserExpensesAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const expenses = await Expense.find({ user: userId }).populate('user', 'email').sort({ date: -1 });
    res.json({ status: 'success', data: { expenses } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// Admin: Update status
exports.updateExpenseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectReason } = req.body;
    if (status === 'Rejected' && !rejectReason) {
      return res.status(400).json({ message: 'Reject reason required' });
    }
    const expense = await Expense.findByIdAndUpdate(id, { status, rejectReason: rejectReason || '' }, { new: true });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    res.json({ status: 'success', data: { expense } });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// Generate PDF with images
exports.generateUserPDF = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const expenses = await Expense.find({ user: userId, status: 'Approved' });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${user.email}_report.pdf`);
    doc.pipe(res);

    doc.fontSize(20).text('Expense Report', { align: 'center' });
    doc.fontSize(12).text(`User: ${user.email}`, { align: 'center' });
    doc.moveDown();

    let total = 0;
    expenses.forEach((exp, i) => {
      total += exp.amount;
      doc.fontSize(10).text(`${i + 1}. ${exp.description} - ${exp.amount.toFixed(2)} INR`);
      doc.text(`   Date: ${new Date(exp.date).toLocaleDateString()} | Category: ${exp.category}`);
      if (exp.file && ['image/jpeg', 'image/png'].includes(exp.file.mimetype)) {
        const filePath = path.join(__dirname, '..', 'uploads', exp.file.filename);
        if (fs.existsSync(filePath)) {
          doc.image(filePath, { width: 200, align: 'center' });
        }
      }
      doc.moveDown();
    });

    doc.fontSize(14).text(`Total: ${total.toFixed(2)} INR`, { align: 'right' });
    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'PDF generation failed' });
  }
};