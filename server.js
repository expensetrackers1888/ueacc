// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const path = require('path');

dotenv.config();

const app = express();

// ✅ Firebase Admin Initialization
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'ueacc-d4d53.firebasestorage.app' // ⚠️ Replace with your actual Firebase bucket name
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


// ⭐⭐⭐ ADD THIS — AUTO CREATE ADMIN USER (same process as your first server.js) ⭐⭐⭐
async function initializeAdminUser() {
  const email = 'uelms2025@gmail.com';   // You can change email
  const password = 'admin123';             // You can change password

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
