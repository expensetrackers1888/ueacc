const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getUserExpenses, addExpense, editExpense, deleteExpense,
  getAllUsersWithStats, getUserExpensesAdmin, updateExpenseStatus,
  generateUserPDF
} = require('../controllers/expenseController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const upload = multer({ dest: 'uploads/' });

router.use(protect);

router.get('/my-expenses', getUserExpenses);
router.post('/', upload.single('file'), addExpense);
router.put('/:id', upload.single('file'), editExpense);
router.delete('/:id', deleteExpense);
router.get('/pdf', generateUserPDF);

router.use(restrictTo('admin'));
router.get('/admin/users', getAllUsersWithStats);
router.get('/admin/user/:userId', getUserExpensesAdmin);
router.put('/admin/:id/status', updateExpenseStatus);
// Add this route
router.get('/admin/pdf', protect, restrictTo('admin'), expenseController.generateAdminPDF);

module.exports = router;