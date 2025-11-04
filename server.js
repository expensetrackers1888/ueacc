// server.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const admin = require('firebase-admin');
const cookieParser = require('cookie-parser'); // <-- ADD THIS

dotenv.config({ path: './.env' });

// === Firebase Admin Init ===
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

// === Middleware ===
app.use(express.json());
app.use(cookieParser()); // <-- ADD THIS

// === CORS – Secure & Cross-Site Cookie Support ===
const allowedOrigins = [
  'http://localhost:3000',
  'https://ueacc.com',
  'https://ueacc.onrender.com',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,        // <-- REQUIRED FOR COOKIES
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// === Routes ===
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const expenseRoutes = require('./routes/expenseRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/expenses', expenseRoutes);

// === MongoDB Connection ===
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// === Seed Admin User (only once) ===
const User = require('./models/User');
(async () => {
  const adminEmail = 'uelms2025@gmail.com';
  const exists = await User.findOne({ email: adminEmail });
  if (!exists) {
    try {
      let firebaseUser;
      try {
        firebaseUser = await admin.auth().getUserByEmail(adminEmail);
        console.log('Admin exists in Firebase');
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          firebaseUser = await admin.auth().createUser({
            email: adminEmail,
            password: 'admin123',
          });
          console.log('Created admin in Firebase');
        } else throw error;
      }

      await User.create({
        firebaseUid: firebaseUser.uid,
        email: adminEmail,
        role: 'admin',
      });
      console.log('Admin created in MongoDB');
    } catch (err) {
      console.error('Admin seed error:', err);
    }
  }
})();

// === Start Server ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});