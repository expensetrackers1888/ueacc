const User = require('../models/User');
const admin = require('firebase-admin');

exports.getAllUsers = async (req, res) => {
  const users = await User.find({ role: 'user' }); // Exclude admins if needed
  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users },
  });
};

exports.addUser = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide email and password' });
  }

  try {
    // Check if user already exists in MongoDB
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Create user in Firebase
    const firebaseUser = await admin.auth().createUser({
      email,
      password,
    });

    // Create user in MongoDB with firebaseUid
    const newUser = await User.create({
      firebaseUid: firebaseUser.uid,
      email,
      role: 'user',
    });

    res.status(201).json({
      status: 'success',
      data: { user: newUser },
    });
  } catch (err) {
    // Handle specific Firebase errors
    if (err.code === 'auth/email-already-in-use') {
      return res.status(400).json({ message: 'User with this email already exists in Firebase' });
    }
    res.status(500).json({ message: 'Error creating user', error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  const user = await User.findByIdAndDelete(id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Optionally, delete user from Firebase
  try {
    await admin.auth().deleteUser(user.firebaseUid);
  } catch (err) {
    console.error('Error deleting user from Firebase:', err);
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
};