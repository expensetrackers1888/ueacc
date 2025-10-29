const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  category: { type: String, required: true },
  otherType: { type: String },
  currency: { type: String, default: 'INR' },
  notes: { type: String },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  rejectReason: { type: String },
  // File attachment
  file: {
    url: { type: String },
    filename: { type: String },
    mimetype: { type: String },
  },
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);