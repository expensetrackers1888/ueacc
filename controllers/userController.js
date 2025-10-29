const User = require('../models/User');
const admin = require('firebase-admin');
const { validationResult } = require('express-validator');

/**
 * GET /api/users
 * Admin only – Get all regular users (role: 'user')
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: { users },
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users',
    });
  }
};

/**
 * POST /api/users
 * Admin only – Add new user (creates in Firebase + MongoDB)
 */
exports.addUser = async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: errors.array()[0].msg,
    });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Please provide email and password',
    });
  }

  try {
    // 1. Check if user already exists in MongoDB
    const existingMongoUser = await User.findOne({ email });
    if (existingMongoUser) {
      return res.status(400).json({
        status: 'error',
        message: 'User with this email already exists',
      });
    }

    // 2. Create user in Firebase Auth
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email,
        password,
        emailVerified: false,
        disabled: false,
      });
    } catch (firebaseErr) {
      if (firebaseErr.code === 'auth/email-already-exists') {
        return res.status(400).json({
          status: 'error',
          message: 'This email is already registered',
        });
      }
      throw firebaseErr;
    }

    // 3. Save user in MongoDB
    const newUser = await User.create({
      firebaseUid: firebaseUser.uid,
      email: email.toLowerCase().trim(),
      role: 'user',
    });

    // 4. Return success (exclude sensitive fields)
    const userResponse = {
      _id: newUser._id,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };

    res.status(201).json({
      status: 'success',
      data: { user: userResponse },
    });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * DELETE /api/users/:id
 * Admin only – Delete user from MongoDB + Firebase
 */
exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Find and delete from MongoDB
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Prevent self-deletion or admin deletion
    if (user.role === 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Cannot delete admin users',
      });
    }

    await User.findByIdAndDelete(id);

    // 2. Delete from Firebase Auth (if firebaseUid exists)
    if (user.firebaseUid) {
      try {
        await admin.auth().deleteUser(user.firebaseUid);
        console.log(`Firebase user deleted: ${user.firebaseUid}`);
      } catch (firebaseErr) {
        console.warn(`Failed to delete Firebase user ${user.firebaseUid}:`, firebaseErr.message);
        // Continue — MongoDB deletion is primary
      }
    }

    res.status(204).json({
      status: 'success',
      data: null,
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete user',
    });
  }
};