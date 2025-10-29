const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const admin = require('firebase-admin');

// Load env
dotenv.config({ path: './.env' });

// Firebase Admin
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
} catch (err) {
  console.error('Invalid FIREBASE_KEY in .env');
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://ueacc.com',
  'https://ueacc.onrender.com',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const expenseRoutes = require('./routes/expenseRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/expenses', expenseRoutes);

// Health
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// 404 (MUST be after all routes)
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ status: 'error', message: err.message || 'Server error' });
});

// MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB error:', err);
    process.exit(1);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Seed admin
const User = require('./models/User');
(async () => {
  const adminEmail = 'uelms2025@gmail.com';
  const adminPassword = 'admin123';

  try {
    const exists = await User.findOne({ email: adminEmail });
    if (exists) {
      console.log('Admin already exists');
      return;
    }

    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByEmail(adminEmail);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        firebaseUser = await admin.auth().createUser({
          email: adminEmail,
          password: adminPassword,
        });
        console.log('Admin created in Firebase');
      } else {
        throw e;
      }
    }

    await User.create({
      firebaseUid: firebaseUser.uid,
      email: adminEmail,
      role: 'admin',
    });
    console.log('Admin created in MongoDB');
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
})();