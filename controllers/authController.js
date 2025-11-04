 
const admin = require('firebase-admin');
const User = require('../models/User');

exports.login = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'ID token is required' });
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

    res.status(200).json({
      status: 'success',
      token: idToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(401).json({ message: 'Invalid ID token' });
  }
};