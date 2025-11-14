// models/Expense.js
const mongoose = require('mongoose');

const billSchema = new mongoose.Schema(
  {
    billUrl: { type: String, required: true },     // public download URL
    billFilename: { type: String, required: true },// original filename
    billPath: { type: String, required: true },    // gs path for deletion
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    currency: { type: String, default: 'INR' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    rejectReason: { type: String, default: '' },
    bills: { type: [billSchema], default: [] },    // ✅ multiple bills
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
