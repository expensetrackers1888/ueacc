// controllers/userController.js
const User = require('../models/User');
const admin = require('firebase-admin');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).select('username email role createdAt');
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: { users },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch users' });
  }
};

exports.addUser = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  try {
    // Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    }

    // Create in Firebase Auth
    const firebaseUser = await admin.auth().createUser({
      email,
      password,
      displayName: username,
    });

    // Create in MongoDB
    const newUser = await User.create({
      firebaseUid: firebaseUser.uid,
      email,
      username,
      role: 'user',
    });

    res.status(201).json({
      status: 'success',
      data: { user: newUser },
    });
  } catch (err) {
    console.error('Add user error:', err);

    if (err.code === 'auth/email-already-in-use') {
      return res.status(400).json({ message: 'Email already registered in authentication system' });
    }

    if (err.code === 'auth/invalid-password') {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    res.status(500).json({ message: 'Error creating user', error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete from Firebase Auth
    if (user.firebaseUid) {
      try {
        await admin.auth().deleteUser(user.firebaseUid);
      } catch (err) {
        console.warn('Failed to delete Firebase user:', err.message);
      }
    }

    // Delete from MongoDB
    await User.findByIdAndDelete(id);

    res.status(204).json({
      status: 'success',
      data: null,
    });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: 'Error deleting user' });
  }
};