// routes/expenseRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');
const expenseController = require('../controllers/expenseController');

const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware.protect);

// USER
router.post('/', upload.single('bill'), expenseController.addExpense);
router.get('/my-expenses', expenseController.getMyExpenses);
router.put('/:id', upload.single('bill'), expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);

// ADMIN
router.get('/all', authMiddleware.restrictTo('admin'), expenseController.getAllExpenses);
router.get('/user/:userId', authMiddleware.restrictTo('admin'), expenseController.getUserExpenses);
router.put('/:id/approve', authMiddleware.restrictTo('admin'), expenseController.approveExpense);
router.put('/:id/reject', authMiddleware.restrictTo('admin'), expenseController.rejectExpense);
router.get('/stats', authMiddleware.restrictTo('admin'), expenseController.getStats);

// PDF
router.get('/user/:userId/pdf', authMiddleware.restrictTo('admin'), expenseController.downloadUserExpensesPDF);

module.exports = router;
