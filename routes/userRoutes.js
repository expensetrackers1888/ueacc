const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes and restrict to admin
router.use(authMiddleware.protect, authMiddleware.restrictTo('admin'));

router.get('/', userController.getAllUsers);
router.post('/', userController.addUser);
router.delete('/:id', userController.deleteUser);

module.exports = router; 
