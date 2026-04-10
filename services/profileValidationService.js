const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ALLOWED_COAT_TYPES = ['Short', 'Medium', 'Long', 'Wire', 'Curly', 'Double', 'Hairless', 'Other'];
const ALLOWED_SEX = ['Male', 'Female'];

const parseConditions = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const calculateAgeFromDateOfBirth = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - dob.getTime();
  if (diffMs < 0) return null;

  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  return Number(years.toFixed(1));
};

const validateDogProfile = (payload = {}) => {
  const errors = [];
  const warnings = [];

  const derivedAge = calculateAgeFromDateOfBirth(payload.dateOfBirth);

  const cleaned = {
    name: String(payload.name || '').trim(),
    breed: String(payload.breed || '').trim(),
    dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : null,
    age: derivedAge,
    weight: Number(payload.weight),
    coatType: String(payload.coatType || '').trim(),
    sex: String(payload.sex || '').trim(),
    existingConditions: parseConditions(payload.existingConditions),
    notes: String(payload.notes || '').trim()
  };

  const recommendedFields = ['name', 'breed', 'dateOfBirth', 'weight', 'coatType', 'sex'];
  let completed = 0;

  if (cleaned.name) completed += 1;
  else errors.push('Dog name is required.');

  if (cleaned.breed) completed += 1;
  else errors.push('Breed is required.');

  if (cleaned.dateOfBirth && !Number.isNaN(cleaned.dateOfBirth.getTime()) && cleaned.age !== null) {
    completed += 1;
  } else {
    errors.push('Date of birth is required and must be a valid past date.');
  }

  if (Number.isFinite(cleaned.weight) && cleaned.weight > 0) completed += 1;
  else errors.push('Weight must be greater than zero.');

  if (cleaned.coatType) {
    if (!ALLOWED_COAT_TYPES.includes(cleaned.coatType)) {
      errors.push('Please select a valid coat type.');
    } else {
      completed += 1;
    }
  } else {
    warnings.push('Coat type is recommended for richer profile detail.');
  }

  if (cleaned.sex) {
    if (!ALLOWED_SEX.includes(cleaned.sex)) {
      errors.push('Please select a valid sex value.');
    } else {
      completed += 1;
    }
  } else {
    warnings.push('Sex is recommended for richer profile detail.');
  }

  if (cleaned.age !== null && cleaned.age > 20) {
    warnings.push('Age looks unusually high. Please verify the date of birth.');
  }

  if (cleaned.weight > 90) {
    warnings.push('Weight looks unusually high. Please verify the value.');
  }

  const profileCompleteness = clamp(
    Math.round((completed / recommendedFields.length) * 100),
    0,
    100
  );

  return {
    cleaned,
    errors,
    warnings,
    profileCompleteness,
    isReadyForUpload: errors.length === 0
  };
};

module.exports = {
  validateDogProfile,
  calculateAgeFromDateOfBirth,
  ALLOWED_COAT_TYPES,
  ALLOWED_SEX
};
