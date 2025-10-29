const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use('/uploads', express.static('uploads'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));

dotenv.config({ path: './.env' });

// Initialize Firebase Admin SDK using environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(express.json());
app.use(cors());

const allowedOrigins = [
  'http://localhost:3000',
  // 'https://ueacc.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('❌ CORS blocked origin:', origin);
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const expenseRoutes = require('./routes/expenseRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/expenses', expenseRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Seed admin user in Firebase and MongoDB on first run
const User = require('./models/User');
(async () => {
  const adminEmail = 'uelms2025@gmail.com';
  const adminExists = await User.findOne({ email: adminEmail });
  if (!adminExists) {
    try {
      let firebaseUser;
      try {
        firebaseUser = await admin.auth().getUserByEmail(adminEmail);
        console.log('Admin user already exists in Firebase');
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          firebaseUser = await admin.auth().createUser({
            email: adminEmail,
            password: 'admin123',
          });
          console.log('Default admin created in Firebase');
        } else {
          throw error;
        }
      }

      await User.create({
        firebaseUid: firebaseUser.uid,
        email: adminEmail,
        role: 'admin',
      });
      console.log('Default admin created in MongoDB');
    } catch (err) {
      console.error('Error creating admin:', err);
    }
  } else {
    console.log('Admin user already exists in MongoDB');
  }
})();