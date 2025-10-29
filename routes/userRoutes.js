// server/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { getAllUsers, addUser, deleteUser } = require('../controllers/userController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect, restrictTo('admin'));

router.get('/', getAllUsers);
router.post('/', addUser);
router.delete('/:id', deleteUser);

module.exports = router;