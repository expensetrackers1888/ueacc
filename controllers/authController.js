// controllers/authController.js
const admin = require('firebase-admin');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------
// Helper: Generate your own JWT (never return Firebase token to frontend)
// ---------------------------------------------------------------------
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// ---------------------------------------------------------------------
// LOGIN – Verify Firebase token, create/find user, return your JWT
// ---------------------------------------------------------------------
exports.login = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({
      status: 'error',
      message: 'ID token is required',
    });
  }

  try {
    // 1. Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid: firebaseUid, email } = decodedToken;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email not found in Firebase token',
      });
    }

    // 2. Find or create user in MongoDB
    let user = await User.findOne({ firebaseUid });

    if (!user) {
      // Determine role: hardcode or use Firebase custom claims
      let role = 'user';

      // Option 1: Hardcoded admin email
      if (email === 'admin@school.com') {
        role = 'admin';
      }

      // Option 2: Use Firebase custom claims (recommended for scalability)
      // if (decodedToken.admin === true) role = 'admin';

      user = await User.create({
        firebaseUid,
        email,
        role,
      });
    } else {
      // Optional: Sync role from Firebase custom claims on every login
      // if (decodedToken.admin === true && user.role !== 'admin') {
      //   user.role = 'admin';
      //   await user.save();
      // }
    }

    // 3. Generate your own JWT
    const token = signToken(user._id);

    // 4. Send response
    res.status(200).json({
      status: 'success',
      token, // <-- Your JWT, NOT Firebase token
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      status: 'error',
      message: 'Invalid or expired ID token',
    });
  }
};