// server/controllers/userController.js
const User = require('../models/User');
const admin = require('firebase-admin');

exports.getAllUsers = async (req, res) => {
  const users = await User.find({ role: 'user' }).select('-firebaseUid');
  res.json({ status: 'success', data: { users } });
};

exports.addUser = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User exists' });

    const firebaseUser = await admin.auth().createUser({ email, password });
    const newUser = await User.create({ firebaseUid: firebaseUser.uid, email, role: 'user' });

    res.status(201).json({ status: 'success', data: { user: newUser } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  await admin.auth().deleteUser(user.firebaseUid);
  await User.findByIdAndDelete(req.params.id);
  res.status(204).json({});
};