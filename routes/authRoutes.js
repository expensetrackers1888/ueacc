const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Login with Firebase ID token (your existing route)
router.post('/login', authController.login);

// ✅ New: verify an existing Bearer token (for App.js boot)
router.get('/verify', authMiddleware.protect, authController.verify);

// ✅ Optional helper: get current user profile via token
router.get('/me', authMiddleware.protect, authController.me);

module.exports = router;
