const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUploadSubmission } = require('../services/submissionValidationService');

test('validateUploadSubmission scores strong technical inputs as high quality', () => {
  const result = validateUploadSubmission({
    file: { size: 8 * 1024 * 1024, originalname: 'walk.mp4' },
    metadata: {
      recordingAngle: 'side-on',
      movementType: 'walk',
      surfaceType: 'grass',
      lightingConditions: 'daylight',
      notes: 'Dog walked comfortably'
    },
    dogProfile: { isReadyForUpload: true },
    consentAccepted: 'true',
    previousUploads: [],
    videoTechnical: {
      durationSeconds: 12,
      width: 1280,
      height: 720,
      orientation: 'landscape'
    }
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.submissionQuality, 'High');
  assert.equal(result.videoTechnical.technicalScore >= 90, true);
});

test('validateUploadSubmission flags weak technical inputs for manual review', () => {
  const result = validateUploadSubmission({
    file: { size: 1024 * 1024, originalname: 'short.mp4' },
    metadata: {
      recordingAngle: 'front',
      movementType: 'run',
      surfaceType: 'gravel',
      lightingConditions: 'dark',
      notes: ''
    },
    dogProfile: { isReadyForUpload: true },
    consentAccepted: 'true',
    previousUploads: [],
    videoTechnical: {
      durationSeconds: 4,
      width: 320,
      height: 240,
      orientation: 'portrait'
    }
  });

  assert.equal(result.requiresManualReview, true);
  assert.equal(result.errors.length > 0, true);
});
