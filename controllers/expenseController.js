// controllers/expenseController.js
const Expense = require('../models/Expense');
const User = require('../models/User');
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');

// Helpers to upload/delete Firebase Storage
const getBucket = () => admin.storage().bucket(); // uses storageBucket set at admin.initializeApp

const makePublicUrl = (bucketName, filePath) =>
  `https://storage.googleapis.com/${bucketName}/${encodeURI(filePath)}`;

// ===================== ADD EXPENSE =====================
exports.addExpense = async (req, res) => {
  try {
    const { description, amount, currency, date, notes } = req.body;
    if (!description || !amount || !currency || !date) {
      return res.status(400).json({ status: 'fail', message: 'All fields required' });
    }

    const expense = await Expense.create({
      user: req.user._id,
      description,
      amount,
      currency,
      date,
      notes: notes || '',
      bills: [],
      // status defaults to 'Pending' per schema
    });

    // If a bill file is included, upload to Firebase Storage and attach
    if (req.file) {
      const bucket = getBucket();
      const safeName = req.file.originalname.replace(/\s+/g, '_');
      const path = `bills/${String(req.user._id)}/${Date.now()}_${safeName}`;
      const file = bucket.file(path);

      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false,
        public: true,
        metadata: { cacheControl: 'public, max-age=31536000' },
      });

      const billObj = {
        billUrl: makePublicUrl(bucket.name, path),
        billFilename: req.file.originalname,
        billPath: path,
      };

      expense.bills.push(billObj);
      await expense.save();
    }

    res.status(201).json({ status: 'success', data: { expense } });
  } catch (err) {
    console.error('Add expense error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to add expense' });
  }
};

// ===================== GET MY EXPENSES =====================
exports.getMyExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.user._id }).sort({ date: -1 });
    res.status(200).json({ status: 'success', data: { expenses } });
  } catch (err) {
    console.error('Fetch my expenses error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to load expenses' });
  }
};

// ===================== UPDATE EXPENSE =====================
// Appends a new bill to the bills[] array if a new file is uploaded
// IMPORTANT: If the updater is the expense owner (non-admin), reset status -> 'Pending' so admin re-approves
exports.updateExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ status: 'fail', message: 'Expense not found' });

    // user/owner or admin only
    if (String(expense.user) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'fail', message: 'Unauthorized' });
    }

    // Basic fields
    const { description, amount, currency, date, notes } = req.body;
    if (description !== undefined) expense.description = description;
    if (amount !== undefined) {
      // robustly convert amount to number
      const parsed = Number(amount);
      expense.amount = Number.isNaN(parsed) ? expense.amount : parsed;
    }
    if (currency !== undefined) expense.currency = currency;
    if (date !== undefined) expense.date = date;
    if (notes !== undefined) expense.notes = notes;

    // If a new file is uploaded, push into bills[]
    if (req.file) {
      const bucket = getBucket();
      const safeName = req.file.originalname.replace(/\s+/g, '_');
      const path = `bills/${String(expense.user)}/${Date.now()}_${safeName}`;
      const f = bucket.file(path);

      await f.save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false,
        public: true,
        metadata: { cacheControl: 'public, max-age=31536000' },
      });

      expense.bills.push({
        billUrl: makePublicUrl(bucket.name, path),
        billFilename: req.file.originalname,
        billPath: path,
      });
    }

    // -------- NEW: Reset status to Pending when a normal user edits their expense --------
    // If the editor is NOT an admin (i.e., the owner/user re-submitted), set status back to 'Pending'
    // so admin will re-review. Also clear any rejectReason.
    // If the editor is an admin, we KEEP the current status (admin intentional edit).
    if (req.user.role !== 'admin' && String(req.user._id) === String(expense.user)) {
      // Only change status if it's different to avoid unnecessary updates
      expense.status = 'Pending';
      expense.rejectReason = '';
    }

    await expense.save();
    res.status(200).json({ status: 'success', data: { expense } });
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update expense' });
  }
};

// ===================== DELETE EXPENSE (permanent) =====================
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ status: 'fail', message: 'Expense not found' });

    // user/owner or admin only
    if (String(expense.user) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'fail', message: 'Unauthorized' });
    }

    // Delete all attached files from Firebase Storage
    const bucket = getBucket();
    for (const b of expense.bills || []) {
      if (b.billPath) {
        try {
          await bucket.file(b.billPath).delete({ ignoreNotFound: true });
        } catch (e) {
          console.warn('Firebase delete warning:', e.message);
        }
      }
    }

    await Expense.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: 'success', message: 'Expense deleted permanently' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to delete expense' });
  }
};

// ===================== ADMIN CONTROLS =====================
exports.getAllExpenses = async (_req, res) => {
  try {
    const expenses = await Expense.find().populate('user', 'email role');
    res.status(200).json({ status: 'success', data: { expenses } });
  } catch (_err) {
    res.status(500).json({ status: 'error', message: 'Failed to load all expenses' });
  }
};

exports.getUserExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ user: req.params.userId }).sort({ date: -1 });
    res.status(200).json({ status: 'success', data: { expenses } });
  } catch (_err) {
    res.status(500).json({ status: 'error', message: 'Failed to load user expenses' });
  }
};

exports.approveExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { status: 'Approved', rejectReason: '' },
      { new: true }
    );
    res.status(200).json({ status: 'success', data: { expense } });
  } catch (_err) {
    res.status(500).json({ status: 'error', message: 'Failed to approve expense' });
  }
};

exports.rejectExpense = async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { status: 'Rejected', rejectReason: req.body.rejectReason || '' },
      { new: true }
    );
    res.status(200).json({ status: 'success', data: { expense } });
  } catch (_err) {
    res.status(500).json({ status: 'error', message: 'Failed to reject expense' });
  }
};

// ===================== STATS (upgraded for AdminPage) =====================
// Returns: { totalUsers, pendingExpenses, totalExpenses: { [currency]: number }, totalsArray: [{_id, total}] }
exports.getStats = async (_req, res) => {
  try {
    const [pendingCount, totalsByCurrency, usersCount] = await Promise.all([
      Expense.countDocuments({ status: 'Pending' }),
      Expense.aggregate([{ $group: { _id: '$currency', total: { $sum: '$amount' } } }]),
      User.countDocuments({ role: 'user' }),
    ]);

    const totalExpensesMap = totalsByCurrency.reduce((acc, row) => {
      acc[row._1d || row._id || 'UNKNOWN'] = Number(row.total) || 0;
      return acc;
    }, {});

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalUsers: usersCount,
          pendingExpenses: pendingCount,
          totalExpenses: totalExpensesMap,
          totalsArray: totalsByCurrency,
        },
      },
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to load stats' });
  }
};

// Backward-compatible alias if your router previously used getAdminStats
exports.getAdminStats = exports.getStats;

// ===================== PDF DOWNLOAD (Upgraded: styled table with borders/zebra) =====================
exports.downloadUserExpensesPDF = async (req, res) => {
  try {
    const { userId } = req.params;
    const style = (req.query.style || '').toLowerCase(); // e.g., ?style=billing (from frontend)
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ status: 'fail', message: 'User not found' });

    const expenses = await Expense.find({ user: userId }).sort({ date: -1 });
    if (expenses.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'No expenses found' });
    }

    // ---- Theme (inspired by UsersPage.css) ----
    const COLORS = {
      text: '#1f2937',         // gray-800
      headerBg: '#f3f4f6',     // gray-100
      zebra: '#f9fafb',        // gray-50
      border: '#e5e7eb',       // gray-200
      brand1: '#10b981',       // emerald-500
      brand2: '#059669',       // emerald-600
    };

    const margin = 40;
    const doc = new PDFDocument({ margin, size: 'A4' }); // portrait A4 for a clean table
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin * 2;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${user.email.replace(/[^a-z0-9@._-]/gi, '_')}_expenses.pdf"`
    );
    doc.pipe(res);

    // ---- Header/Title ----
    const gradientBarHeight = 8;
    doc
      .rect(margin, margin - 20, contentWidth, gradientBarHeight)
      .fillColor(COLORS.brand1)
      .fill();

    doc
      .fillColor(COLORS.text)
      .fontSize(18)
      .text('School Expense Tracker — User Expense Report', margin, margin + 2, {
        width: contentWidth,
        align: 'center',
      });

    doc
      .fontSize(10)
      .fillColor(COLORS.text)
      .text(`User: ${user.email}`, margin, doc.y + 6, { width: contentWidth, align: 'center' });

    doc
      .fontSize(10)
      .fillColor(COLORS.text)
      .text(`Generated: ${new Date().toLocaleString()}`, { width: contentWidth, align: 'center' });

    doc.moveDown(1);

    // ---- Table config ----
    // Columns: S.No | Description | Date | Amount | Currency | Status | Bills
    const cols = [
      { key: 'sno', label: 'S.No', width: 30, align: 'right' },
      { key: 'description', label: 'Description', width: 160, align: 'left' },
      { key: 'date', label: 'Date', width: 70, align: 'left' },
      { key: 'amount', label: 'Amount', width: 60, align: 'right' },
      { key: 'currency', label: 'Currency', width: 50, align: 'left' },
      { key: 'status', label: 'Status', width: 60, align: 'left' },
      { key: 'bills', label: 'Bills', width: contentWidth - (30 + 160 + 70 + 60 + 50 + 60), align: 'left' }, // remaining
    ];

    const headerHeight = 24;
    const rowMinHeight = 20;
    const cellPaddingX = 6;
    const cellPaddingY = 6;
    let cursorY = doc.y + 8;

    const drawTableBorderRow = (y, height, fillColor = null) => {
      if (fillColor) {
        doc.save().rect(margin, y, contentWidth, height).fill(fillColor).restore();
      }
      // Outline row
      doc
        .lineWidth(0.5)
        .strokeColor(COLORS.border)
        .rect(margin, y, contentWidth, height)
        .stroke();
    };

    const drawTextInCell = (text, x, y, width, height, align = 'left', isBold = false) => {
      const options = {
        width: width - cellPaddingX * 2,
        height: height - cellPaddingY * 2,
        align,
      };
      if (isBold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
      doc
        .fillColor(COLORS.text)
        .text(text, x + cellPaddingX, y + cellPaddingY, options);
    };

    const wrapText = (text, maxWidth, font = 'Helvetica', fontSize = 10) => {
      doc.font(font).fontSize(fontSize);
      const words = String(text ?? '').split(/\s+/);
      const lines = [];
      let current = '';
      for (const w of words) {
        const test = current ? `${current} ${w}` : w;
        if (doc.widthOfString(test) <= maxWidth) {
          current = test;
        } else {
          if (current) lines.push(current);
          current = w;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [''];
    };

    const calcRowHeight = (rowObj) => {
      const fontSize = 10;
      const padd = cellPaddingY * 2;
      let maxLines = 1;

      const colText = (col) => {
        let val = rowObj[col.key] ?? '';
        if (col.key === 'bills' && Array.isArray(val)) val = val.join(', ');
        return String(val);
      };

      for (const col of cols) {
        const lines = wrapText(colText(col), col.width - cellPaddingX * 2, 'Helvetica', fontSize);
        maxLines = Math.max(maxLines, lines.length);
      }
      return Math.max(rowMinHeight, maxLines * (fontSize + 2) + padd);
    };

    const addPageIfNeeded = (neededHeight) => {
      const bottom = doc.page.height - margin;
      if (cursorY + neededHeight > bottom) {
        // Footer before new page
        drawFooter();
        doc.addPage();
        cursorY = margin + 20;
        drawHeaderRow(); // re-draw header on new page
      }
    };

    const drawHeaderRow = () => {
      const y = cursorY;
      drawTableBorderRow(y, headerHeight, COLORS.headerBg);
      let x = margin;
      for (const col of cols) {
        drawTextInCell(col.label, x, y, col.width, headerHeight, col.align, true);
        // vertical separators
        doc
          .moveTo(x + col.width, y)
          .lineTo(x + col.width, y + headerHeight)
          .strokeColor(COLORS.border)
          .lineWidth(0.5)
          .stroke();
        x += col.width;
      }
      cursorY += headerHeight;
    };

    const drawBodyRow = (rowObj, isZebra) => {
      const rowHeight = calcRowHeight(rowObj);
      addPageIfNeeded(rowHeight);

      const y = cursorY;
      drawTableBorderRow(y, rowHeight, isZebra ? COLORS.zebra : '#ffffff');

      let x = margin;
      for (const col of cols) {
        let val = rowObj[col.key] ?? '';
        if (col.key === 'bills' && Array.isArray(val)) val = val.join(', ');
        drawTextInCell(String(val), x, y, col.width, rowHeight, col.align, false);

        // vertical separators
        doc
          .moveTo(x + col.width, y)
          .lineTo(x + col.width, y + rowHeight)
          .strokeColor(COLORS.border)
          .lineWidth(0.5)
          .stroke();

        x += col.width;
      }

      cursorY += rowHeight;
    };

    const drawFooter = () => {
      const pageNumber = doc.page.number;
      const footerY = doc.page.height - margin + 10;
      doc
        .fontSize(9)
        .fillColor('#6b7280')
        .text(`Page ${pageNumber}`, margin, footerY, { width: contentWidth, align: 'center' });
    };

    // ---- Render table header ----
    doc.moveDown(0.5);
    drawHeaderRow();

    // ---- Rows & totals (by currency) ----
    const totalsByCurrency = {};
    expenses.forEach((e, idx) => {
      const currency = e.currency || 'INR';
      totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + (Number(e.amount) || 0);

      const billsList = (e.bills || []).length
        ? e.bills.map((b) => b.billFilename)
        : ['No Bill'];

      const row = {
        sno: idx + 1,
        description: e.description || '',
        date: new Date(e.date).toLocaleDateString(),
        amount: (Number(e.amount) || 0).toFixed(2),
        currency,
        status: e.status || 'Pending',
        bills: billsList,
      };
      drawBodyRow(row, idx % 2 === 1);
    });

    // ---- Totals section ----
    doc.moveDown(1);
    addPageIfNeeded(60);

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(COLORS.text)
      .text('Totals by Currency', { continued: false });

    const totalsStartY = doc.y + 6;
    const totalsCols = [
      { label: 'Currency', width: 120 },
      { label: 'Total Amount', width: 160 },
    ];
    const totalsWidth = totalsCols.reduce((s, c) => s + c.width, 0);
    const totalsX = margin;

    // Header
    doc
      .save()
      .rect(totalsX, totalsStartY, totalsWidth, 22)
      .fill(COLORS.headerBg)
      .restore()
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .rect(totalsX, totalsStartY, totalsWidth, 22)
      .stroke();

    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text);
    doc.text('Currency', totalsX + 6, totalsStartY + 6, { width: totalsCols[0].width - 12, align: 'left' });
    doc.text('Total Amount', totalsX + totalsCols[0].width + 6, totalsStartY + 6, {
      width: totalsCols[1].width - 12,
      align: 'right',
    });

    let yT = totalsStartY + 22;
    Object.entries(totalsByCurrency).forEach(([cur, amt], i) => {
      const rowH = 20;
      const fill = i % 2 === 1 ? COLORS.zebra : '#ffffff';

      doc.save().rect(totalsX, yT, totalsWidth, rowH).fill(fill).restore();
      doc.strokeColor(COLORS.border).lineWidth(0.5).rect(totalsX, yT, totalsWidth, rowH).stroke();

      doc.font('Helvetica').fontSize(10).fillColor(COLORS.text);
      doc.text(cur, totalsX + 6, yT + 5, { width: totalsCols[0].width - 12, align: 'left' });
      doc.text((amt || 0).toFixed(2), totalsX + totalsCols[0].width + 6, yT + 5, {
        width: totalsCols[1].width - 12,
        align: 'right',
      });

      yT += rowH;
    });

    // Final footer and end
    drawFooter();
    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF' });
  }
};
