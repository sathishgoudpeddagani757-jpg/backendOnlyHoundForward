const mongoose = require('mongoose');
const DogProfile = require('../models/DogProfile');

const fixDogProfileIndexes = async () => {
  const collection = mongoose.connection.db.collection('dogprofiles');

  const indexes = await collection.indexes();
  const ownerIndex = indexes.find((index) => index.name === 'owner_1');

  if (ownerIndex && ownerIndex.unique) {
    console.log('⚠️ Found legacy unique index on dogprofiles.owner. Dropping it...');
    await collection.dropIndex('owner_1');
    console.log('✅ Dropped legacy unique index owner_1 from dogprofiles.');
  }

  await DogProfile.syncIndexes();
  console.log('✅ DogProfile indexes synced.');
};

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI is missing in backend/.env');
  }

  await mongoose.connect(mongoUri);
  console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);

  await fixDogProfileIndexes();
};

module.exports = connectDB;