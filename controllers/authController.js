const admin = require('firebase-admin');
const User = require('../models/User');

/**
 * POST /api/auth/login
 * Body: { idToken }
 * - Verifies Firebase ID token
 * - Finds/creates user in MongoDB
 * - Returns { status, token, user }
 */
exports.login = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ status: 'fail', message: 'ID token is required' });
  }

  try {
    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;

    // Find or create user in MongoDB
    let user = await User.findOne({ firebaseUid });
    if (!user) {
      user = await User.create({
        firebaseUid,
        email,
        role: email === 'admin@school.com' ? 'admin' : 'user',
      });
    }

    return res.status(200).json({
      status: 'success',
      token: idToken, // client can store this ID token
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(401).json({ status: 'fail', message: 'Invalid ID token' });
  }
};

/**
 * GET /api/auth/verify
 * Headers: Authorization: Bearer <idToken>
 * - Uses protect middleware to verify the token and attach req.user
 * - Returns the current user (for App.js auto-login on refresh)
 */
exports.verify = async (req, res) => {
  try {
    // req.user is set by authMiddleware.protect
    if (!req.user) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    return res.status(200).json({
      status: 'success',
      user: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ status: 'error', message: 'Verification failed' });
  }
};

/**
 * GET /api/auth/me
 * Headers: Authorization: Bearer <idToken>
 * - Same as /verify but semantic "profile" route
 */
exports.me = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    return res.status(200).json({
      status: 'success',
      user: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch user' });
  }
};
