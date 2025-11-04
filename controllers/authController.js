// src/controllers/authController.js   (FULL FIXED VERSION)
const admin = require('firebase-admin');
const User = require('../models/User');
require('dotenv').config();               // <-- make sure .env is loaded

// Put your admin email in .env → ADMIN_EMAIL=uelms2025@gmail.com
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'uelms2025@gmail.com';

exports.login = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'ID token is required' });
  }

  try {
    // 1. Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email?.toLowerCase();

    if (!email) {
      return res.status(400).json({ message: 'Email not found in token' });
    }

    // 2. Find or create MongoDB user
    let user = await User.findOne({ firebaseUid });

    if (!user) {
      // NEW USER → decide role
      const role = email === ADMIN_EMAIL ? 'admin' : 'user';

      user = await User.create({
        firebaseUid,
        email,
        role,
      });
    }

    // 3. Send back token + user info
    res.status(200).json({
      status: 'success',
      token: idToken,                 // client already has it – just echo
      user: {
        id: user._id,
        email: user.email,
        role: user.role,              // ← this is now correct
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ message: 'Invalid ID token' });
  }
};