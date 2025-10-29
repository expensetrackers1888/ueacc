const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getAllUsers,
  addUser,
  deleteUser,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

// Protect all routes
router.use(protect);
router.use(authorize('admin'));

// GET /api/users
router.get('/', getAllUsers);

// POST /api/users
router.post(
  '/',
  [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],
  addUser
);

// DELETE /api/users/:id
router.delete('/:id', deleteUser);

module.exports = router;