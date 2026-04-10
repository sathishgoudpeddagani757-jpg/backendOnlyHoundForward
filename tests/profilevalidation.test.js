const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDogProfile } = require('../services/profileValidationService');

test('validateDogProfile produces upload-ready profile with valid payload', () => {
  const result = validateDogProfile({
    name: 'Milo',
    breed: 'Labrador Retriever',
    dateOfBirth: '2021-01-10',
    weight: 28,
    coatType: 'Short',
    sex: 'Male',
    existingConditions: 'none',
    notes: 'Healthy and active'
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.isReadyForUpload, true);
  assert.equal(result.profileCompleteness >= 90, true);
});
