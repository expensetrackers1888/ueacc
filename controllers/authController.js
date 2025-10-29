const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validationResult } = require('express-validator');

/**
 * POST /api/auth/login
 * Public route – Authenticate with Firebase ID token
 * Returns secure JWT + user data
 */
exports.login = async (req, res) => {
  // === 1. Validate Input ===
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: errors.array()[0].msg,
    });
  }

  const { idToken } = req.body;

  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({
      status: 'error',
      message: 'ID token is required and must be a string',
    });
  }

  try {
    // === 2. Verify Firebase ID Token ===
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email?.toLowerCase();
    const emailVerified = decodedToken.email_verified || false;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email not found in Firebase token',
      });
    }

    // === 3. Find or Create User in MongoDB ===
    let user = await User.findOne({ firebaseUid });

    if (!user) {
      // Auto-assign admin role for specific email
      const role = email === 'admin@school.com' ? 'admin' : 'user';

      user = await User.create({
        firebaseUid,
        email,
        role,
        emailVerified,
      });

      console.log(`New user created: ${email} (${role})`);
    } else {
      // Optional: Sync email verification status
      if (user.emailVerified !== emailVerified) {
        user.emailVerified = emailVerified;
        await user.save();
      }
    }

    // === 4. Generate Secure JWT (your own backend token) ===
    const jwtPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    const jwtToken = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    // === 5. Send Response ===
    res.status(200).json({
      status: 'success',
      token: jwtToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error('Login error:', err);

    // Specific Firebase errors
    if (err.code?.startsWith('auth/')) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired Firebase token',
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Authentication failed',
      // Only show details in development
      ...(process.env.NODE_ENV === 'development' && { error: err.message }),
    });
  }
};