const Expense = require('../models/Expense');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const admin = require('firebase-admin');
const path = require('path');
const fetch = require('node-fetch'); // Add this dependency if not present: npm i node-fetch

const convertCurrency = (amount, currency) => {
  const rates = {
    INR: 1,
    USD: 0.012,
    ZMW: 0.31,
  };
  return (amount * rates[currency]).toFixed(2);
};

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

exports.getUserExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
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

exports.getUserExpensesAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
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

exports.addExpense = async (req, res) => {
  try {
    const { description, amount, date, currency, notes } = req.body;
    if (!description || !amount || !date) {
      return res.status(400).json({ message: 'Please provide description, amount, and date' });
    }

    let billUrl = '';
    if (req.file) {
      const file = req.file;
      const ext = path.extname(file.originalname).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.pdf'].includes(ext)) {
        return res.status(400).json({ message: 'Invalid file type. Only PNG, JPG, PDF allowed.' });
      }
      const fileName = `bills/${Date.now()}${ext}`;
      const bucket = admin.storage().bucket();
      await bucket.file(fileName).save(file.buffer, {
        contentType: file.mimetype,
      });
      billUrl = await bucket.file(fileName).getSignedUrl({
        action: 'read',
        expires: '01-01-2030',
      });
      billUrl = billUrl[0];
    }

    const newExpense = await Expense.create({
      description,
      amount: parseFloat(amount),
      date: new Date(date),
      currency: currency || 'INR',
      notes: notes || '',
      billUrl,
      user: req.user.id,
      status: 'Pending',
    });

    const populatedExpense = await Expense.findById(newExpense._id).populate('user', 'email').lean();

    res.status(201).json({
      status: 'success',
      data: { expense: populatedExpense },
    });
  } catch (error) {
    console.error('Add expense error:', error);
    res.status(500).json({ message: 'Error adding expense', error: error.message });
  }
};

exports.editExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, date, currency, notes } = req.body;

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    if (expense.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit your own expenses' });
    }

    let billUrl = expense.billUrl;
    if (req.file) {
      const file = req.file;
      const ext = path.extname(file.originalname).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.pdf'].includes(ext)) {
        return res.status(400).json({ message: 'Invalid file type. Only PNG, JPG, PDF allowed.' });
      }
      const fileName = `bills/${Date.now()}${ext}`;
      const bucket = admin.storage().bucket();
      await bucket.file(fileName).save(file.buffer, {
        contentType: file.mimetype,
      });
      billUrl = await bucket.file(fileName).getSignedUrl({
        action: 'read',
        expires: '01-01-2030',
      });
      billUrl = billUrl[0];

      // Delete old file if exists
      if (expense.billUrl) {
        const oldFileName = expense.billUrl.split('/bills/')[1].split('?')[0];
        await bucket.file(`bills/${oldFileName}`).delete().catch(() => {});
      }
    }

    expense.description = description || expense.description;
    expense.amount = amount ? parseFloat(amount) : expense.amount;
    expense.date = date ? new Date(date) : expense.date;
    expense.currency = currency || expense.currency;
    expense.notes = notes || expense.notes;
    expense.billUrl = billUrl;
    expense.status = 'Pending'; // Reset to Pending on edit

    await expense.save();

    const populatedExpense = await Expense.findById(id).populate('user', 'email').lean();

    res.status(200).json({
      status: 'success',
      data: { expense: populatedExpense },
    });
  } catch (error) {
    console.error('Edit expense error:', error);
    res.status(500).json({ message: 'Error editing expense', error: error.message });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    if (expense.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own expenses' });
    }

    // Delete bill file if exists
    if (expense.billUrl) {
      const fileName = expense.billUrl.split('/bills/')[1].split('?')[0];
      const bucket = admin.storage().bucket();
      await bucket.file(`bills/${fileName}`).delete().catch(() => {});
    }

    await Expense.findByIdAndDelete(id);

    res.status(204).json({
      status: 'success',
      data: null,
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ message: 'Error deleting expense', error: error.message });
  }
};

exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectReason } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }
    if (status === 'Rejected' && !rejectReason) {
      return res.status(400).json({ message: 'Reject reason is required for rejected status' });
    }

    const expense = await Expense.findByIdAndUpdate(
      id,
      { status, rejectReason: rejectReason || '' },
      { new: true, runValidators: true }
    ).populate('user', 'email').lean();

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.status(200).json({
      status: 'success',
      data: { expense },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating expense', error: error.message });
  }
};

exports.getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalExpenses = await Expense.countDocuments();
    const pendingExpenses = await Expense.countDocuments({ status: 'Pending' });
    const approvedExpenses = await Expense.countDocuments({ status: 'Approved' });
    const rejectedExpenses = await Expense.countDocuments({ status: 'Rejected' });
    const totalAmount = await Expense.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totalUsers,
        totalExpenses,
        pendingExpenses,
        approvedExpenses,
        rejectedExpenses,
        totalApprovedAmount: totalAmount[0]?.total || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch stats' });
  }
};

exports.generateUserExpensesPDF = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const expenses = await Expense.find({ user: userId }).lean();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${user.email}_expenses.pdf"`);

    const doc = new PDFDocument({ margin: 20, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(18).text(`Expenses for ${user.email}`, 50, 50);

    let y = 100;
    for (const exp of expenses) {
      doc.fontSize(12).text(`Description: ${exp.description}`, 50, y);
      y += 20;
      doc.text(`Amount: ${exp.amount} ${exp.currency}`, 50, y);
      y += 20;
      doc.text(`Date: ${new Date(exp.date).toLocaleDateString()}`, 50, y);
      y += 20;
      doc.text(`Status: ${exp.status}`, 50, y);
      y += 20;
      if (exp.billUrl) {
        const response = await fetch(exp.billUrl);
        const buffer = await response.buffer();
        doc.addImage(buffer, 'PNG', 50, y, 100, 100); // Adjust size as needed
        y += 110;
      }
      y += 20; // Space between entries
    }

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF: ' + error.message });
  }
};