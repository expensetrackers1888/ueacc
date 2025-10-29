const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    // Core Fields
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },

    // Optional / Derived
    otherType: {
      type: String,
      default: '',
      trim: true,
    },
    currency: {
      type: String,
      enum: ['INR', 'USD', 'ZMW'],
      default: 'INR',
      uppercase: true,
    },

    // User Notes
    notes: {
      type: String,
      default: '',
      trim: true,
    },

    // File Attachment (from multer)
    file: {
      type: String,
      default: null,
    },

    // Structured Details (e.g., bill breakdown)
    details: {
      type: [mongoose.Schema.Types.Mixed], // Allows array of objects
      default: [],
    },

    // Approval Workflow
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    rejectReason: {
      type: String,
      default: '',
      trim: true,
    },

    // Ownership
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for performance
expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ category: 1 });

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;