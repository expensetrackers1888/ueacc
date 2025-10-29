const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

// User routes
router.use(authMiddleware.protect);
router.get('/my-expenses', expenseController.getUserExpenses);
router.get('/my-approved', expenseController.getMyApprovedExpenses);
router.post('/', upload.single('file'), expenseController.addExpense);
router.put('/approved/:id', upload.single('file'), expenseController.updateApprovedExpense);

// Admin routes
router.use(authMiddleware.restrictTo('admin'));
router.get('/admin/users', expenseController.getAdminUsers);
router.get('/admin/user/:userId', expenseController.getUserExpensesAdmin);
router.put('/admin/:id/status', expenseController.updateExpenseStatus);
router.get('/admin/user/:userId/pdf', expenseController.generateUserPDF);

module.exports = router;