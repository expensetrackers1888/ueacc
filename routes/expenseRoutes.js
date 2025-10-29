const express = require('express');
const router = express.Router();
const {
  getAllExpenses,
  addExpense,
  editExpense,
  getUserExpenses,
  getUserExpensesAdmin,
  updateExpenseStatus,
  deleteExpense,
  getAdminStats,
  generateUserExpensesPDF,
  upload,
} = require('../controllers/expenseController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/me', getUserExpenses);
router.post('/', upload, addExpense);
router.put('/:id', upload, editExpense);
router.delete('/:id', deleteExpense);

router.get('/admin/stats', authorize('admin'), getAdminStats);
router.get('/admin/all', authorize('admin'), getAllExpenses);
router.get('/admin/user/:userId', authorize('admin'), getUserExpensesAdmin);
router.patch('/admin/:id', authorize('admin'), updateExpenseStatus);
router.get('/admin/pdf/:userId', authorize('admin'), generateUserExpensesPDF);

router.post('/', authMiddleware.protect, expenseController.upload, expenseController.addExpense);
router.put('/:id', authMiddleware.protect, expenseController.upload, expenseController.editExpense);

module.exports = router;