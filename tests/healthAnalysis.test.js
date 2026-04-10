const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeSubmission } = require('../services/healthAnalysisService');

test('analyzeSubmission includes video technical quality in confidence score', () => {
  const strong = analyzeSubmission({
    dogProfile: { age: 4, weight: 20, existingConditions: [] },
    metadata: {
      recordingAngle: 'side-on',
      movementType: 'walk',
      surfaceType: 'grass',
      lightingConditions: 'daylight',
      notes: 'Comfortable gait'
    },
    videoTechnical: {
      durationSeconds: 12,
      width: 1280,
      height: 720,
      orientation: 'landscape',
      estimatedBitrateKbps: 2000,
      technicalScore: 96
    },
    validation: {
      metadataCompleteness: 100,
      submissionQuality: 'High',
      warnings: []
    },
    previousUploads: []
  });

  const weak = analyzeSubmission({
    dogProfile: { age: 4, weight: 20, existingConditions: [] },
    metadata: {
      recordingAngle: 'front',
      movementType: 'run',
      surfaceType: 'gravel',
      lightingConditions: 'dark',
      notes: ''
    },
    videoTechnical: {
      durationSeconds: 5,
      width: 320,
      height: 240,
      orientation: 'portrait',
      estimatedBitrateKbps: 200,
      technicalScore: 42
    },
    validation: {
      metadataCompleteness: 80,
      submissionQuality: 'Needs Improvement',
      warnings: ['Poor lighting']
    },
    previousUploads: []
  });

  assert.equal(strong.confidenceScore > weak.confidenceScore, true);
  assert.equal(strong.qualityScore > weak.qualityScore, true);
});
