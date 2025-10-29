const express = require('express');
const expenseController = require('../controllers/expenseController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware.protect);

router.get('/', authMiddleware.restrictTo('admin'), expenseController.getAllExpenses);
router.get('/stats', authMiddleware.restrictTo('admin'), expenseController.getAdminStats);
router.patch('/:id', authMiddleware.restrictTo('admin'), expenseController.updateExpense);
router.get('/user/:userId', authMiddleware.restrictTo('admin'), expenseController.getUserExpensesAdmin);
router.get('/user/:userId/pdf', authMiddleware.restrictTo('admin'), expenseController.generateUserExpensesPDF);

router.post('/', expenseController.addExpense);
router.put('/:id', expenseController.editExpense);
router.get('/my-expenses', expenseController.getUserExpenses);
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;