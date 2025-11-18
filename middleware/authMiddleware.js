const admin = require('firebase-admin');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  let token;

  // Extract Bearer Token
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: 'fail',
      message: 'Not authorized. No token provided.',
    });
  }

  try {
    // Verify Firebase ID Token — important second param for expiry check
    const decoded = await admin.auth().verifyIdToken(token, true);

    // Find user in MongoDB
    const user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'User no longer exists in database',
      });
    }

    req.user = user;
    next();

  } catch (err) {
    console.error('🔥 protect middleware error:', err);

    // Handle token expired error
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({
        status: 'fail',
        message: 'Firebase ID token expired. Refresh token required.',
        errorCode: 'TOKEN_EXPIRED',
      });
    }

    // Other errors
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid or malformed token',
      errorCode: err.code || 'INVALID_TOKEN',
    });
  }
};

// Role-based access control
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action',
      });
    }
    next();
  };
};
