const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const privateStorageDir = process.env.PRIVATE_UPLOADS_DIR
  ? path.resolve(process.env.PRIVATE_UPLOADS_DIR)
  : path.resolve(__dirname, '..', '..', 'private_storage');

const ensurePrivateStorageDir = () => {
  if (!fs.existsSync(privateStorageDir)) {
    fs.mkdirSync(privateStorageDir, { recursive: true });
  }
  return privateStorageDir;
};

const buildStoredFilename = (originalName = '') => {
  const ext = path.extname(originalName || '').toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
};

const removeFileIfExists = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (error) {
    console.error('Failed to remove file:', error.message);
  }
  return false;
};

module.exports = {
  privateStorageDir,
  ensurePrivateStorageDir,
  buildStoredFilename,
  removeFileIfExists
};
