require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

const makeAdmin = async () => {
  try {
    const email = process.argv[2];

    if (!email) {
      console.log('Please provide an email.');
      console.log('Example: npm run make-admin -- admin@example.com');
      process.exit(1);
    }

    await connectDB();

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      console.log('User not found.');
      process.exit(1);
    }

    user.role = 'admin';
    await user.save();

    console.log(`User ${user.email} is now an admin.`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to make admin:', error.message);
    process.exit(1);
  }
};

makeAdmin();