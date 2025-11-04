// routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware'); // <-- Add this

const router = express.Router();

// PUBLIC ROUTES
router.post('/login', authController.login);

// PROTECTED ROUTES
// Verify JWT token – called on every app load to restore session
router.get('/verify-token', protect, async (req, res) => {
  try {
    // req.user is set by `protect` middleware (from JWT payload)
    res.status(200).json({
      status: 'success',
      user: req.user, // Should include: _id, email, role, etc.
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error during token verification',
    });
  }
});

module.exports = router;