// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const path = require('path');

dotenv.config();

const app = express();

// ✅ Firebase Admin Initialization using .env (NO JSON FILE)
let serviceAccount;
try {
  const firebaseKeyString = process.env.FIREBASE_KEY;
  if (!firebaseKeyString) {
    throw new Error('FIREBASE_KEY is missing in .env file');
  }

  // Parse the JSON string from .env
  serviceAccount = JSON.parse(firebaseKeyString);

  // Optional: Validate required fields
  if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error('Invalid FIREBASE_KEY: missing required fields');
  }

} catch (error) {
  console.error('❌ Failed to parse FIREBASE_KEY from .env:', error.message);
  process.exit(1); // Exit if Firebase can't be initialized
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'ueacc-d4d53.firebasestorage.app'
});

const bucket = admin.storage().bucket();

const allowedOrigins = [
  'http://localhost:3000',
  'https://ueacc.com',
  'https://ueacc.onrender.com',    
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('❌ CORS blocked origin:', origin);
      callback(null, false); // Don't throw!
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// ✅ Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ✅ Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// ✅ Firebase Upload Middleware Helper
app.locals.bucket = bucket;

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// ⭐⭐⭐ AUTO CREATE ADMIN USER ⭐⭐⭐
async function initializeAdminUser() {
  const email = 'uelms2025@gmail.com';   // Change if needed
  const password = 'admin123';           // Change if needed

  try {
    const existing = await admin.auth().getUserByEmail(email).catch(() => null);

    if (existing) {
      console.log(`🔵 Admin user already exists: ${email}, UID: ${existing.uid}`);
      return;
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    console.log('🟢 Admin user created with UID:', userRecord.uid);

  } catch (error) {
    console.error('🔴 Error creating admin user:', error.message);
  }
}

initializeAdminUser();
// ⭐⭐⭐ ADMIN AUTO CREATION ENDS HERE ⭐⭐⭐

// ✅ Root Route
app.get('/', (req, res) => {
  res.send('Expense Tracker Backend Running ✅');
});

// ✅ 404 Fallback
app.use((req, res) => {
  res.status(404).json({ status: 'fail', message: 'Route not found' });
});

// ✅ Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('💥 Server Error:', err);
  res.status(500).json({ status: 'error', message: 'Internal Server Error' });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});