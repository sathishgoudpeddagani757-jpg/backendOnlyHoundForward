const express = require('express');
const authMiddleware = require('../middleware/auth');
const DogProfile = require('../models/DogProfile');
const { validateDogProfile } = require('../services/profileValidationService');
const { recordAudit } = require('../utils/audit');

const router = express.Router();

router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const validation = validateDogProfile(req.body);

    if (validation.errors.length > 0) {
      return res.status(400).json({
        message: validation.errors[0],
        errors: validation.errors,
        warnings: validation.warnings,
        profileCompleteness: validation.profileCompleteness
      });
    }

    const requestedProfileId = req.body.profileId || null;
    const requestedPrimary =
      String(req.body.isPrimary) === 'true' || req.body.isPrimary === true;

    let profile;
    let created = false;

    if (requestedProfileId) {
      const existingProfile = await DogProfile.findOne({
        _id: requestedProfileId,
        owner: req.user._id
      });

      if (!existingProfile) {
        return res.status(404).json({ message: 'Dog profile not found.' });
      }

      profile = await DogProfile.findOneAndUpdate(
        { _id: requestedProfileId, owner: req.user._id },
        {
          owner: req.user._id,
          ...validation.cleaned,
          isPrimary: requestedPrimary || existingProfile.isPrimary,
          profileCompleteness: validation.profileCompleteness,
          isReadyForUpload: validation.isReadyForUpload
        },
        { new: true, runValidators: true }
      );
    } else {
      const existingCount = await DogProfile.countDocuments({ owner: req.user._id });

      profile = await DogProfile.create({
        owner: req.user._id,
        ...validation.cleaned,
        isPrimary: existingCount === 0 ? true : requestedPrimary,
        profileCompleteness: validation.profileCompleteness,
        isReadyForUpload: validation.isReadyForUpload
      });

      created = true;
    }

    if (profile.isPrimary) {
      await DogProfile.updateMany(
        { owner: req.user._id, _id: { $ne: profile._id } },
        { $set: { isPrimary: false } }
      );
    }

    const profiles = await DogProfile.find({ owner: req.user._id }).sort({
      isPrimary: -1,
      createdAt: -1
    });

    const selectedProfile =
      profiles.find((item) => String(item._id) === String(profile._id)) || profiles[0];

    await recordAudit({
      req,
      actor: req.user,
      action: created ? 'profile.created' : 'profile.saved',
      entityType: 'DogProfile',
      entityId: profile._id,
      details: {
        breed: profile.breed,
        profileCompleteness: profile.profileCompleteness,
        readyForUpload: profile.isReadyForUpload,
        isPrimary: profile.isPrimary,
        totalProfiles: profiles.length
      }
    });

    res.json({
      message: created
        ? 'Dog profile created successfully.'
        : 'Dog profile saved successfully.',
      profile: selectedProfile,
      profiles,
      warnings: validation.warnings
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.owner) {
      return res.status(400).json({
        message:
          'A legacy database index is blocking multiple dog profiles for the same owner. Restart the backend and try again.'
      });
    }

    next(error);
  }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const profiles = await DogProfile.find({ owner: req.user._id }).sort({
      isPrimary: -1,
      createdAt: -1
    });

    if (!profiles.length) {
      return res.status(404).json({ message: 'Dog profile not found.' });
    }

    const profile = profiles.find((item) => item.isPrimary) || profiles[0];

    res.json({ profile, profiles });
  } catch (error) {
    next(error);
  }
});

module.exports = router;