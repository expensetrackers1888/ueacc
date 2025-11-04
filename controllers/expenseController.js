const Expense = require('../models/Expense');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const admin = require('firebase-admin');
const path = require('path');

// Helper function to convert amounts to different currencies
const convertCurrency = (amount, currency) => {
  const rates = {
    INR: 1,
    USD: 0.012, // 1 INR = 0.012 USD
    ZMW: 0.31,  // 1 INR = 0.31 ZMW
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
        expires: '01-01-2030', // Long expiration
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
  // Implement stats if needed, stub for now
  res.status(200).json({ status: 'success', data: {} });
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

    const table = {
      x: 20,
      width: doc.page.width - 40,
      headerHeight: 20,
      rowHeight: 15,
      rowSpacing: 5,
      totalRowHeight: 20,
      columnWidths: {
        description: (doc.page.width - 40) * 0.3,
        amount: (doc.page.width - 40) * 0.15,
        currency: (doc.page.width - 40) * 0.1,
        date: (doc.page.width - 40) * 0.15,
        status: (doc.page.width - 40) * 0.1,
        bill: (doc.page.width - 40) * 0.2,
      },
    };

    const tableTop = 50;

    doc.font('Helvetica-Bold').fontSize(12).text(`Expenses for ${user.email}`, { align: 'center' });
    doc.moveDown();

    // Draw table headers
    let x = table.x;
    let y = tableTop;
    doc.rect(table.x, y, table.width, table.headerHeight).fill('#374151');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff');
    const headerY = y + (table.headerHeight - 10) / 2;
    doc.text('Description', x + 5, headerY, { width: table.columnWidths.description - 5 });
    x += table.columnWidths.description;
    doc.text('Amount', x + 5, headerY, { width: table.columnWidths.amount - 5, align: 'right' });
    x += table.columnWidths.amount;
    doc.text('Currency', x + 5, headerY, { width: table.columnWidths.currency - 5, align: 'center' });
    x += table.columnWidths.currency;
    doc.text('Date', x + 5, headerY, { width: table.columnWidths.date - 5, align: 'center' });
    x += table.columnWidths.date;
    doc.text('Status', x + 5, headerY, { width: table.columnWidths.status - 5, align: 'center' });
    x += table.columnWidths.status;
    doc.text('Bill', x + 5, headerY, { width: table.columnWidths.bill - 5, align: 'center' });

    // Draw table rows
    y += table.headerHeight + table.rowSpacing;
    expenses.forEach((exp, index) => {
      const background = index % 2 === 0 ? '#f3f4f6' : '#f9fafb';
      doc
        .rect(table.x, y, table.width, table.rowHeight)
        .fill(background)
        .stroke('#d1d5db');
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#374151');
      
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
      doc.text(exp.status, x, textY, { width: table.columnWidths.status - 5, align: 'center' });
      x += table.columnWidths.status;
      doc.text(exp.billUrl ? 'Attached' : 'None', x, textY, { width: table.columnWidths.bill - 5, align: 'center' });
      y += table.rowHeight + table.rowSpacing;
    });

    // Add total row
    const totalY = y;
    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2);
    const currency = expenses.length > 0 ? expenses[0].currency || 'INR' : 'INR';
    doc
      .rect(table.x, totalY, table.width, table.totalRowHeight)
      .fill('#e5e7eb')
      .stroke('#d1d5db');
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#1f2937');
    x = table.x + 5;
    doc.text('Total', x, totalY + (table.totalRowHeight - 10) / 2, { width: table.columnWidths.description });
    x += table.columnWidths.description;
    doc.text(`${totalAmount} (${currency})`, x, totalY + (table.totalRowHeight - 10) / 2, { width: table.columnWidths.amount - 5, align: 'right' });
    
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF: ' + error.message });
  }
};