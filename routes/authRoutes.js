const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { login } = require('../controllers/authController');

// POST /api/auth/login
router.post(
  '/login',
  [
    body('idToken')
      .isString()
      .withMessage('ID token must be a string')
      .notEmpty()
      .withMessage('ID token is required'),
  ],
  login
);

module.exports = router;