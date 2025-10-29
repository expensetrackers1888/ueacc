const Expense = require('../models/Expense');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

exports.getUserExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.user.id }).sort({ date: -1 });
    res.json({ status: 'success', data: { expenses } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addExpense = async (req, res) => {
  try {
    const { description, amount, date, category, otherType } = req.body;
    const file = req.file;

    const expense = await Expense.create({
      description,
      amount: parseFloat(amount),
      date,
      category,
      otherType: otherType || '',
      file: file ? `/uploads/${file.filename}` : null,
      user: req.user.id
    });

    const populated = await Expense.findById(expense._id).populate('user', 'email');
    res.status(201).json({ status: 'success', data: { expense: populated } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.editExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (expense.user.toString() !== req.user.id || expense.status !== 'Pending') {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const updates = req.body;
    if (req.file) updates.file = `/uploads/${req.file.filename}`;

    const updated = await Expense.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ status: 'success', data: { expense: updated } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (expense.user.toString() !== req.user.id || expense.status !== 'Pending') {
      return res.status(403).json({ message: 'Not allowed' });
    }
    await Expense.findByIdAndDelete(req.params.id);
    res.status(204).json({});
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllUsersWithStats = async (req, res) => {
  const users = await User.find({ role: 'user' });
  const stats = await Promise.all(users.map(async (user) => {
    const exps = await Expense.find({ user: user._id });
    return {
      ...user.toObject(),
      stats: {
        pending: exps.filter(e => e.status === 'Pending').length,
        approved: exps.filter(e => e.status === 'Approved').length,
        total: exps.reduce((s, e) => s + e.amount, 0).toFixed(2)
      }
    };
  }));
  res.json({ status: 'success', data: { users: stats } });
};

exports.getUserExpensesAdmin = async (req, res) => {
  const expenses = await Expense.find({ user: req.params.userId }).sort({ date: -1 });
  res.json({ status: 'success', data: { expenses } });
};

exports.updateExpenseStatus = async (req, res) => {
  const { status, rejectReason } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }
  const expense = await Expense.findByIdAndUpdate(
    req.params.id,
    { status, rejectReason: rejectReason || '' },
    { new: true }
  );
  res.json({ status: 'success', data: { expense } });
};

exports.generateUserPDF = async (req, res) => {
  const expenses = await Expense.find({ user: req.user.id, status: 'Approved' }).sort({ date: -1 });
  const user = await User.findById(req.user.id);

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${user.email}_expenses.pdf`);
  doc.pipe(res);

  doc.fontSize(20).text('Approved Expenses Report', { align: 'center' });
  doc.fontSize(12).text(`User: ${user.email}`, { align: 'center' });
  doc.moveDown();

  if (expenses.length === 0) {
    doc.text('No approved expenses.');
  } else {
    let y = doc.y;
    const rowHeight = 25;
    doc.fontSize(10);

    // Header
    ['S.No', 'Date', 'Category', 'Amount', 'File'].forEach((h, i) => {
      doc.text(h, 50 + i * 100, y);
    });
    y += rowHeight;

    expenses.forEach((exp, i) => {
      doc.text((i + 1).toString(), 50, y);
      doc.text(new Date(exp.date).toLocaleDateString(), 150, y);
      doc.text(exp.category + (exp.otherType ? ` (${exp.otherType})` : ''), 250, y);
      doc.text(`₹${exp.amount}`, 350, y);
      doc.text(exp.file ? 'Yes' : '—', 450, y);
      y += rowHeight;
    });
  }

  doc.end();
};