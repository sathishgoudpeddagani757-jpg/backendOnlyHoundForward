const express = require('express');
const authMiddleware = require('../middleware/auth');
const DogProfile = require('../models/DogProfile');
const Consent = require('../models/Consent');
const { recordAudit } = require('../utils/audit');

const router = express.Router();
const CURRENT_CONSENT_VERSION = '2.0';
const DEFAULT_CONSENT_TEXT =
  'I confirm that I consent to the upload, review, secure storage, dashboard reporting, and optional anonymised research use of this canine mobility submission for the Hound Forward MVP.';

router.use(authMiddleware);

router.get('/active', async (req, res, next) => {
  try {
    const { dogProfileId } = req.query;

    if (!dogProfileId) {
      return res.status(400).json({ message: 'dogProfileId is required.' });
    }

    const dogProfile = await DogProfile.findOne({ _id: dogProfileId, owner: req.user._id });
    if (!dogProfile) {
      return res.status(404).json({ message: 'Dog profile not found.' });
    }

    const activeConsent = await Consent.findOne({
      owner: req.user._id,
      dogProfile: dogProfile._id,
      status: 'active'
    }).sort({ createdAt: -1 });

    res.json({
      currentVersion: CURRENT_CONSENT_VERSION,
      activeConsent,
      needsUpdate: !activeConsent || activeConsent.version !== CURRENT_CONSENT_VERSION
    });
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const { dogProfileId } = req.query;

    if (!dogProfileId) {
      return res.status(400).json({ message: 'dogProfileId is required.' });
    }

    const dogProfile = await DogProfile.findOne({ _id: dogProfileId, owner: req.user._id });
    if (!dogProfile) {
      return res.status(404).json({ message: 'Dog profile not found.' });
    }

    const history = await Consent.find({
      owner: req.user._id,
      dogProfile: dogProfile._id
    }).sort({ createdAt: -1 });

    res.json({ history, currentVersion: CURRENT_CONSENT_VERSION });
  } catch (error) {
    next(error);
  }
});

router.post('/accept', async (req, res, next) => {
  try {
    const {
      dogProfileId,
      consentText,
      version = CURRENT_CONSENT_VERSION,
      researchAllowed = false
    } = req.body;

    const dogProfile = await DogProfile.findOne({ _id: dogProfileId, owner: req.user._id });
    if (!dogProfile) {
      return res.status(404).json({ message: 'Dog profile not found.' });
    }

    await Consent.updateMany(
      { owner: req.user._id, dogProfile: dogProfile._id, status: 'active' },
      { $set: { status: 'superseded' } }
    );

    const consent = await Consent.create({
      owner: req.user._id,
      dogProfile: dogProfile._id,
      accepted: true,
      version: String(version || CURRENT_CONSENT_VERSION).trim(),
      consentText: String(consentText || DEFAULT_CONSENT_TEXT).trim(),
      researchAllowed: Boolean(researchAllowed),
      dashboardAllowed: true,
      reportAllowed: true,
      acceptedAt: new Date(),
      status: 'active'
    });

    await recordAudit({
      req,
      actor: req.user,
      action: 'consent.accepted',
      entityType: 'Consent',
      entityId: consent._id,
      details: {
        dogProfileId: dogProfile._id,
        version: consent.version,
        researchAllowed: consent.researchAllowed
      }
    });

    res.status(201).json({
      message: 'Consent accepted successfully.',
      consent,
      currentVersion: CURRENT_CONSENT_VERSION
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/revoke', async (req, res, next) => {
  try {
    const consent = await Consent.findOne({ _id: req.params.id, owner: req.user._id });

    if (!consent) {
      return res.status(404).json({ message: 'Consent not found.' });
    }

    if (consent.status !== 'active') {
      return res.status(400).json({ message: 'Only active consent can be revoked.' });
    }

    consent.status = 'revoked';
    consent.revokedAt = new Date();
    consent.revokedReason = String(req.body.reason || '').trim();
    await consent.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'consent.revoked',
      entityType: 'Consent',
      entityId: consent._id,
      details: {
        dogProfileId: consent.dogProfile,
        reason: consent.revokedReason
      }
    });

    res.json({ message: 'Consent revoked successfully.', consent });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
