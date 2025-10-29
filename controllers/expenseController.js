const Expense = require('../models/Expense');
const User = require('../models/User');
const PDFDocument = require('pdfkit');

// Helper function to convert amounts to different currencies
const convertCurrency = (amount, currency) => {
  const rates = {
    INR: 1,
    USD: 0.012, // 1 INR = 0.012 USD
    ZMW: 0.31,  // 1 INR = 0.31 ZMW
  };
  return (amount * rates[currency]).toFixed(2);
};

// ====================
// 1. GET ALL EXPENSES (ADMIN)
// ====================
exports.getAllExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find().populate('user', 'email').lean();
    res.status(200).json({
      status: 'success',
      results: expenses.length,
      data: { expenses },
    });
  } catch (error) {
    console.error('getAllExpenses error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ====================
// 2. GET USER'S OWN EXPENSES
// ====================
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
    console.error('getUserExpenses error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ====================
// 3. GET ANY USER'S EXPENSES (ADMIN)
// ====================
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
    console.error('getUserExpensesAdmin error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ====================
// 4. ADD NEW EXPENSE
// ====================
exports.addExpense = async (req, res) => {
  try {
    const { description, amount, date, category, otherType, currency, notes } = req.body;

    if (!description || !amount || !date || !category) {
      return res.status(400).json({ message: 'Please provide description, amount, date, and category' });
    }

    const newExpense = await Expense.create({
      description,
      amount: parseFloat(amount),
      date: new Date(date),
      category,
      otherType: otherType || '',
      currency: currency || 'INR',
      notes: notes || '',
      user: req.user.id,
      status: 'Pending',
    });

    const populatedExpense = await Expense.findById(newExpense._id).populate('user', 'email').lean();

    res.status(201).json({
      status: 'success',
      data: { expense: populatedExpense },
    });
  } catch (error) {
    console.error('addExpense error:', error);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// ====================
// 5. EDIT PENDING EXPENSE (USER)
// ====================
exports.editExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, date, category, otherType, currency, notes } = req.body;

    if (!description || !amount || !date || !category) {
      return res.status(400).json({ message: 'Please provide description, amount, date, and category' });
    }

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (expense.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You do not have permission to edit this expense' });
    }

    if (expense.status !== 'Pending') {
      return res.status(400).json({ message: 'Only pending expenses can be edited' });
    }

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      {
        description,
        amount: parseFloat(amount),
        date: new Date(date),
        category,
        otherType: otherType || '',
        currency: currency || 'INR',
        notes: notes || '',
      },
      { new: true, runValidators: true }
    ).populate('user', 'email').lean();

    res.status(200).json({
      status: 'success',
      data: { expense: updatedExpense },
    });
  } catch (error) {
    console.error('editExpense error:', error);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// ====================
// 6. GET USER'S APPROVED EXPENSES ONLY
// ====================
exports.getMyApprovedExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
    const expenses = await Expense.find({ user: userId, status: 'Approved' })
      .populate('user', 'email')
      .lean();

    res.status(200).json({
      status: 'success',
      data: { expenses },
    });
  } catch (error) {
    console.error('getMyApprovedExpenses error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ====================
// 7. SUBMIT UPDATED APPROVED EXPENSES (BULK UPSERT)
// ====================
exports.submitApprovedUpdates = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'No updates provided' });
    }

    const userId = req.user.id;

    // Validate each update
    for (const update of updates) {
      if (!update.category || isNaN(update.amount) || update.amount < 0) {
        return res.status(400).json({ message: 'Invalid update data: category and valid amount required' });
      }
    }

    // Build bulk operations: upsert one expense per category
    const operations = updates.map(update => ({
      updateOne: {
        filter: { user: userId, category: update.category, status: 'Approved' },
        update: {
          $set: {
            amount: parseFloat(update.amount),
            description: `Updated approved expense for ${update.category}`,
            date: new Date(),
            currency: 'INR',
            notes: 'Updated via approved expenses table',
          },
        },
        upsert: true,
        setDefaultsOnInsert: true,
      },
    }));

    const result = await Expense.bulkWrite(operations);

    res.status(200).json({
      status: 'success',
      message: `${result.upsertedCount} created, ${result.modifiedCount} updated. Submitted for admin review.`,
      data: { result },
    });
  } catch (error) {
    console.error('submitApprovedUpdates error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to submit updates: ' + error.message });
  }
};

// ====================
// 8. APPROVE / REJECT EXPENSE (ADMIN)
// ====================
exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectReason } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be Approved or Rejected' });
    }

    if (status === 'Rejected' && !rejectReason) {
      return res.status(400).json({ message: 'Reject reason is required for rejected status' });
    }

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      { status, rejectReason: rejectReason || '' },
      { new: true, runValidators: true }
    ).populate('user', 'email').lean();

    if (!updatedExpense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.status(200).json({
      status: 'success',
      data: { expense: updatedExpense },
    });
  } catch (error) {
    console.error('updateExpense error:', error);
    res.status(400).json({ status: 'error', message: error.message });
  }
};

// ====================
// 9. DELETE PENDING EXPENSE
// ====================
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (expense.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You do not have permission to delete this expense' });
    }

    if (expense.status !== 'Pending') {
      return res.status(400).json({ message: 'Only pending expenses can be deleted' });
    }

    await Expense.findByIdAndDelete(id);

    res.status(204).json({
      status: 'success',
      data: null,
    });
  } catch (error) {
    console.error('deleteExpense error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ====================
// 10. ADMIN STATS
// ====================
exports.getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalExpenses = await Expense.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingExpenses = await Expense.countDocuments({ status: 'Pending' });

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const dailyExpenses = await Expense.aggregate([
      { $match: { date: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const weeklyExpenses = await Expense.aggregate([
      { $match: { date: { $gte: startOfWeek } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const monthlyExpenses = await Expense.aggregate([
      { $match: { date: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalExpenseAmount = totalExpenses[0]?.total || 0;

    const stats = {
      totalUsers,
      totalExpenses: {
        INR: totalExpenseAmount.toFixed(2),
        USD: convertCurrency(totalExpenseAmount, 'USD'),
        ZMW: convertCurrency(totalExpenseAmount, 'ZMW'),
      },
      pendingExpenses,
      dailyExpenses: {
        INR: (dailyExpenses[0]?.total || 0).toFixed(2),
        USD: convertCurrency(dailyExpenses[0]?.total || 0, 'USD'),
        ZMW: convertCurrency(dailyExpenses[0]?.total || 0, 'ZMW'),
      },
      weeklyExpenses: {
        INR: (weeklyExpenses[0]?.total || 0).toFixed(2),
        USD: convertCurrency(weeklyExpenses[0]?.total || 0, 'USD'),
        ZMW: convertCurrency(weeklyExpenses[0]?.total || 0, 'ZMW'),
      },
      monthlyExpenses: {
        INR: (monthlyExpenses[0]?.total || 0).toFixed(2),
        USD: convertCurrency(monthlyExpenses[0]?.total || 0, 'USD'),
        ZMW: convertCurrency(monthlyExpenses[0]?.total || 0, 'ZMW'),
      },
    };

    res.status(200).json({
      status: 'success',
      data: { stats },
    });
  } catch (error) {
    console.error('getAdminStats error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
};

// ====================
// 11. GENERATE USER EXPENSES PDF (ADMIN)
// ====================
exports.generateUserExpensesPDF = async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Accept');

    const { userId } = req.params;
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const expenses = await Expense.find({ user: userId }).lean();
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });

    const sanitizedEmail = user.email.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${sanitizedEmail}_expenses_report.pdf`);
    doc.pipe(res);

    // Header
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1f2937').text('Expense Report', { align: 'center' });
    doc.fontSize(14).fillColor('#4b5563').text(`Generated for: ${user.email}`, { align: 'center' });
    doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    const table = {
      x: 50,
      width: 495,
      columnWidths: { description: 200, amount: 70, currency: 50, date: 75, category: 50, status: 50 },
      rowHeight: 30,
      rowSpacing: 10,
      headerHeight: 30,
      totalRowHeight: 40,
    };

    if (expenses.length === 0) {
      doc.font('Helvetica').fontSize(14).fillColor('#4b5563').text('No expenses found.', { align: 'center' });
    } else {
      const tableTop = doc.y;

      // Header
      doc.rect(table.x, tableTop, table.width, table.headerHeight).fill('#e5e7eb').stroke('#d1d5db');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937');

      let x = table.x + 5;
      const headerY = tableTop + (table.headerHeight - 10) / 2;
      doc.text('Description', x, headerY, { width: table.columnWidths.description });
      x += table.columnWidths.description;
      doc.text('Amount', x, headerY, { width: table.columnWidths.amount, align: 'right' });
      x += table.columnWidths.amount;
      doc.text('Currency', x, headerY, { width: table.columnWidths.currency, align: 'center' });
      x += table.columnWidths.currency;
      doc.text('Date', x, headerY, { width: table.columnWidths.date, align: 'center' });
      x += table.columnWidths.date;
      doc.text('Category', x, headerY, { width: table.columnWidths.category, align: 'center' });
      x += table.columnWidths.category;
      doc.text('Status', x, headerY, { width: table.columnWidths.status, align: 'center' });

      // Rows
      expenses.forEach((exp, index) => {
        const y = tableTop + table.headerHeight + index * (table.rowHeight + table.rowSpacing);
        const bg = index % 2 === 0 ? '#ffffff' : '#f9fafb';
        doc.rect(table.x, y, table.width, table.rowHeight).fill(bg).stroke('#d1d5db');
        doc.font('Helvetica').fontSize(10).fillColor('#374151');

        x = table.x + 5;
        const textY = y + (table.rowHeight - 10) / 2;
        const desc = exp.description.length > 50 ? exp.description.substring(0, 47) + '...' : exp.description;

        doc.text(desc, x, textY, { width: table.columnWidths.description - 5 });
        x += table.columnWidths.description;
        doc.text(exp.amount.toFixed(2), x, textY, { width: table.columnWidths.amount - 5, align: 'right' });
        x += table.columnWidths.amount;
        doc.text(exp.currency, x, textY, { width: table.columnWidths.currency - 5, align: 'center' });
        x += table.columnWidths.currency;
        doc.text(new Date(exp.date).toLocaleDateString(), x, textY, { width: table.columnWidths.date - 5, align: 'center' });
        x += table.columnWidths.date;
        doc.text(exp.category, x, textY, { width: table.columnWidths.category - 5, align: 'center' });
        x += table.columnWidths.category;
        doc.text(exp.status, x, textY, { width: table.columnWidths.status - 5, align: 'center' });
      });

      // Total Row
      const totalY = tableTop + table.headerHeight + expenses.length * (table.rowHeight + table.rowSpacing) + 10;
      const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2);
      const currency = expenses[0]?.currency || 'INR';

      doc.rect(table.x, totalY, table.width, table.totalRowHeight).fill('#e5e7eb').stroke('#d1d5db');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937');
      x = table.x + 5;
      doc.text('Total', x, totalY + (table.totalRowHeight - 10) / 2, { width: table.columnWidths.description });
      x += table.columnWidths.description;
      doc.text(`${totalAmount} (${currency})`, x, totalY + (table.totalRowHeight - 10) / 2, { width: table.columnWidths.amount - 5, align: 'right' });

      doc.moveDown(1);
    }

    doc.end();
  } catch (error) {
    console.error('generateUserExpensesPDF error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF: ' + error.message });
  }
};