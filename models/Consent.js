const mongoose = require('mongoose');

const consentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    dogProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DogProfile',
      required: true,
      index: true
    },
    accepted: {
      type: Boolean,
      required: true,
      default: false
    },
    version: {
      type: String,
      required: true,
      default: '2.0'
    },
    status: {
      type: String,
      enum: ['active', 'revoked', 'superseded'],
      default: 'active'
    },
    consentText: {
      type: String,
      required: true
    },
    researchAllowed: {
      type: Boolean,
      default: false
    },
    dashboardAllowed: {
      type: Boolean,
      default: true
    },
    reportAllowed: {
      type: Boolean,
      default: true
    },
    acceptedAt: {
      type: Date,
      default: Date.now
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokedReason: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

consentSchema.index({ owner: 1, dogProfile: 1, status: 1, version: -1, createdAt: -1 });

module.exports = mongoose.model('Consent', consentSchema);
