// routes/authRoutes.js
const express = require('express');
const admin = require('firebase-admin');
const User = require('../models/User');
const authController = require('../controllers/authController');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { idToken }
 * Returns: { token, user: { id, email, role } }
 */
router.post('/login', authController.login);

/**
 * Middleware: Verify Firebase ID token from Authorization header
 * Sets req.user = decoded Firebase user
 */
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // { uid, email, ... }
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * GET /api/auth/me
 * Headers: Authorization: Bearer <idToken>
 * Returns: current user info (for auto-login on reload)
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ message: 'User not found in database' });
    }

    res.json({
      status: 'success',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('GET /me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;