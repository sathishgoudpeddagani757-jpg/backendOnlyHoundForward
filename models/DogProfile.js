const mongoose = require('mongoose');

const dogProfileSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    breed: {
      type: String,
      required: true,
      trim: true
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    age: {
      type: Number,
      required: true,
      min: 0
    },
    weight: {
      type: Number,
      required: true,
      min: 0
    },
    coatType: {
      type: String,
      default: '',
      trim: true
    },
    sex: {
      type: String,
      default: '',
      trim: true
    },
    existingConditions: {
      type: [String],
      default: []
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    profileCompleteness: {
      type: Number,
      default: 0
    },
    isReadyForUpload: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

dogProfileSchema.index({ owner: 1, isPrimary: -1, createdAt: -1 });
dogProfileSchema.index({ owner: 1, name: 1 });

dogProfileSchema.set('toJSON', { virtuals: true });
dogProfileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DogProfile', dogProfileSchema);
