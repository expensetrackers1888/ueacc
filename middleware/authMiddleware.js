// middleware/authMiddleware.js
const admin = require('firebase-admin');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

/**
 * PROTECT – Verify Firebase ID token (from frontend)
 * Also supports your own JWT if you use one
 */
exports.protect = async (req, res, next) => {
  let token;

  // 1. Get token from header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'You are not logged in. Please log in to get access.',
    });
  }

  try {
    let decoded;

    // 2. Try Firebase ID token first (your current flow)
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (firebaseError) {
      // 3. If Firebase fails, try your own JWT (optional fallback)
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid token. Please log in again.',
        });
      }
    }

    let user;

    // 4. If Firebase token
    if (decoded.uid) {
      user = await User.findOne({ firebaseUid: decoded.uid });
    }
    // 5. If your own JWT
    else if (decoded.id) {
      user = await User.findById(decoded.id);
    }

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token no longer exists.',
      });
    }

    // 6. Attach user to request
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({
      status: 'error',
      message: 'Token verification failed. Please log in again.',
    });
  }
};

/**
 * RESTRICT TO – Role-based authorization
 * Usage: router.get('/admin', protect, restrictTo('admin'), handler)
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to perform this action.',
      });
    }
    next();
  };
};