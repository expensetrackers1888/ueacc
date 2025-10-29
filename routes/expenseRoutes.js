const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const expenseController = require('../controllers/expenseController');
const { protect, authorize } = require('../middleware/auth');   // <-- CORRECT IMPORT

// Multer upload middleware (from controller)
const { upload } = expenseController;

// ---------------------------------------------------------------------
// PUBLIC / USER ROUTES
// ---------------------------------------------------------------------

// Add new expense (user)
router.post(
  '/',
  protect,                                   // <-- auth
  upload,                                    // <-- file upload
  [
    body('description').trim().notEmpty(),
    body('amount').isFloat({ min: 0 }),
    body('date').isISO8601(),
    body('category').trim().notEmpty(),
  ],
  expenseController.addExpense
);

// Edit expense (only pending & own)
router.put(
  '/:id',
  protect,
  upload,
  expenseController.editExpense
);

// Delete expense (only pending & own)
router.delete('/:id', protect, expenseController.deleteExpense);

// Get my expenses
router.get('/me', protect, expenseController.getUserExpenses);

// ---------------------------------------------------------------------
// ADMIN ONLY ROUTES
// ---------------------------------------------------------------------

router.use(protect, authorize('admin'));   // <-- all below require admin

// Admin: get all expenses
router.get('/admin/all', expenseController.getAllExpenses);

// Admin: get one user’s expenses
router.get('/admin/user/:userId', expenseController.getUserExpensesAdmin);

// Admin: approve / reject
router.patch('/admin/:id', expenseController.updateExpenseStatus);

// Admin: generate PDF for a user
router.get('/admin/pdf/:userId', expenseController.generateUserExpensesPDF);

// Admin: stats dashboard
router.get('/admin/stats', expenseController.getAdminStats);

module.exports = router;