const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalise = (value = '') => String(value).trim().toLowerCase();
const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const REQUIRED_MULTI_ANGLES = ['front', 'left', 'right', 'rear'];

const buildVideoTechnicalAssessment = ({ file, videoTechnical = {} }) => {
  const durationSeconds = safeNumber(videoTechnical.durationSeconds, 0);
  const width = safeNumber(videoTechnical.width, 0);
  const height = safeNumber(videoTechnical.height, 0);

  let orientation = String(videoTechnical.orientation || '').trim().toLowerCase();
  if (!orientation) {
    if (width > height) orientation = 'landscape';
    else if (height > width) orientation = 'portrait';
    else if (width > 0 && height > 0) orientation = 'square';
    else orientation = 'unknown';
  }

  const aspectRatio = width > 0 && height > 0 ? Number((width / height).toFixed(2)) : 0;
  const estimatedBitrateKbps =
    durationSeconds > 0 ? Math.round((safeNumber(file?.size, 0) * 8) / 1000 / durationSeconds) : 0;

  let technicalScore = 100;
  const technicalWarnings = [];
  const technicalErrors = [];

  if (!durationSeconds) {
    technicalWarnings.push('Video duration metadata could not be read.');
    technicalScore -= 8;
  } else if (durationSeconds < 5) {
    technicalErrors.push('Video is too short. Please upload at least 5 seconds of walking footage.');
    technicalScore -= 35;
  } else if (durationSeconds < 8) {
    technicalWarnings.push('Video is shorter than the recommended 8–30 second gait clip.');
    technicalScore -= 15;
  } else if (durationSeconds > 30) {
    technicalWarnings.push('Video is longer than recommended. A shorter gait-focused clip is preferred.');
    technicalScore -= 8;
  }

  if (!width || !height) {
    technicalWarnings.push('Video resolution metadata could not be read.');
    technicalScore -= 6;
  } else {
    if (width < 640 || height < 360) {
      technicalWarnings.push('Video resolution is below the recommended 640x360 minimum.');
      technicalScore -= 18;
    }

    if (orientation !== 'landscape') {
      technicalWarnings.push('Landscape orientation is recommended for clearer gait comparison.');
      technicalScore -= 12;
    }

    if (aspectRatio && (aspectRatio < 1.2 || aspectRatio > 2.3)) {
      technicalWarnings.push('Video framing looks unusual. Keep the dog fully visible in a standard landscape frame.');
      technicalScore -= 8;
    }
  }

  if (estimatedBitrateKbps && estimatedBitrateKbps < 500) {
    technicalWarnings.push('Video quality may be compressed, which can reduce review confidence.');
    technicalScore -= 6;
  }

  technicalScore = clamp(Math.round(technicalScore), 0, 100);

  return {
    durationSeconds,
    width,
    height,
    orientation,
    aspectRatio,
    estimatedBitrateKbps,
    technicalScore,
    technicalWarnings,
    technicalErrors
  };
};

const buildMultiAngleAssessment = ({ angleClips = [] }) => {
  const perAngle = angleClips.map(({ angle, file, videoTechnical }) => ({
    angle,
    ...buildVideoTechnicalAssessment({ file, videoTechnical })
  }));

  const scoreValues = perAngle.map((item) => safeNumber(item.technicalScore, 0));
  const widthValues = perAngle.map((item) => safeNumber(item.width, 0));
  const heightValues = perAngle.map((item) => safeNumber(item.height, 0));
  const aspectRatios = perAngle.map((item) => safeNumber(item.aspectRatio, 0)).filter(Boolean);
  const durations = perAngle.map((item) => safeNumber(item.durationSeconds, 0));
  const bitrates = perAngle.map((item) => safeNumber(item.estimatedBitrateKbps, 0)).filter(Boolean);
  const orientations = [...new Set(perAngle.map((item) => item.orientation).filter(Boolean))];

  const technicalWarnings = perAngle.flatMap((item) =>
    item.technicalWarnings.map((warning) => `[${item.angle}] ${warning}`)
  );
  const technicalErrors = perAngle.flatMap((item) =>
    item.technicalErrors.map((error) => `[${item.angle}] ${error}`)
  );

  return {
    durationSeconds: Number(durations.reduce((sum, value) => sum + value, 0).toFixed(2)),
    width: Math.max(...widthValues, 0),
    height: Math.max(...heightValues, 0),
    orientation:
      orientations.length === 1 ? orientations[0] : orientations.length > 1 ? 'mixed' : 'unknown',
    aspectRatio: aspectRatios.length
      ? Number((aspectRatios.reduce((sum, value) => sum + value, 0) / aspectRatios.length).toFixed(2))
      : 0,
    estimatedBitrateKbps: bitrates.length
      ? Math.round(bitrates.reduce((sum, value) => sum + value, 0) / bitrates.length)
      : 0,
    technicalScore: scoreValues.length
      ? Math.round(scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length)
      : 0,
    technicalWarnings,
    technicalErrors,
    clipCount: perAngle.length,
    capturedAngles: perAngle.map((item) => item.angle),
    perAngle
  };
};

const validateUploadSubmission = ({
  file,
  metadata = {},
  dogProfile,
  consentAccepted,
  videoTechnical = {},
  previousUploads = [],
  angleClips = []
}) => {
  const errors = [];
  const warnings = [];
  const capturedAngles = angleClips.map((item) => normalise(item.angle)).filter(Boolean);
  const isMultiAngle = normalise(metadata.captureMode) === 'guided-multi-angle' || capturedAngles.length > 0;
  const missingAngles = isMultiAngle
    ? REQUIRED_MULTI_ANGLES.filter((angle) => !capturedAngles.includes(angle))
    : [];

  if (!dogProfile) {
    errors.push('Dog profile is required before upload.');
  }

  if (dogProfile && !dogProfile.isReadyForUpload) {
    errors.push('Dog profile is incomplete. Please complete required profile fields first.');
  }

  if (isMultiAngle) {
    if (!angleClips.length) {
      errors.push('All four guided angle clips are required.');
    }

    if (missingAngles.length) {
      errors.push(`Missing required guided views: ${missingAngles.join(', ')}.`);
    }
  } else if (!file) {
    errors.push('Video file is required.');
  }

  if (String(consentAccepted) !== 'true') {
    errors.push('Consent must be accepted before upload.');
  }

  const requiredMetadataFields = ['recordingAngle', 'movementType', 'surfaceType', 'lightingConditions'];
  const completenessParts = [];

  requiredMetadataFields.forEach((field) => {
    if (String(metadata[field] || '').trim()) {
      completenessParts.push(1);
    } else {
      errors.push(`${field} is required.`);
      completenessParts.push(0);
    }
  });

  if (String(metadata.notes || '').trim()) {
    completenessParts.push(1);
  } else {
    warnings.push('Adding notes is recommended for stronger interpretation.');
    completenessParts.push(0);
  }

  if (isMultiAngle) {
    if (!missingAngles.length && capturedAngles.length === REQUIRED_MULTI_ANGLES.length) {
      completenessParts.push(1);
    } else {
      completenessParts.push(0);
    }
  }

  const metadataCompleteness = clamp(
    Math.round((completenessParts.reduce((sum, value) => sum + value, 0) / completenessParts.length) * 100),
    0,
    100
  );

  const angle = normalise(metadata.recordingAngle);
  const movement = normalise(metadata.movementType);
  const surface = normalise(metadata.surfaceType);
  const lighting = normalise(metadata.lightingConditions);

  if (isMultiAngle) {
    warnings.push('Guided four-angle capture detected.');
  } else if (!['side-on', 'side on', 'side'].includes(angle)) {
    warnings.push('A side-on recording angle is recommended for better gait comparison.');
  }

  if (!['walk', 'trot'].includes(movement)) {
    warnings.push('Walk or trot is recommended for more consistent comparison.');
  }

  if (!['grass', 'concrete', 'pavement', 'indoor-flat', 'indoor flat', 'flat', 'tile'].includes(surface)) {
    warnings.push('A flatter and more stable surface is recommended.');
  }

  if (!['daylight', 'bright-indoor', 'bright indoor', 'normal', 'bright'].includes(lighting)) {
    warnings.push('Better lighting is recommended to improve submission confidence.');
  }

  if (!isMultiAngle && file && file.size > 30 * 1024 * 1024) {
    warnings.push('Large video file detected. Shorter clips may improve upload performance.');
  }

  if (isMultiAngle) {
    const totalSize = angleClips.reduce((sum, item) => sum + safeNumber(item.file?.size, 0), 0);
    if (totalSize > 80 * 1024 * 1024) {
      warnings.push('Large combined upload detected. Keep each clip short to improve upload performance.');
    }
  }

  const technicalAssessment = isMultiAngle
    ? buildMultiAngleAssessment({ angleClips })
    : buildVideoTechnicalAssessment({ file, videoTechnical });

  warnings.push(...technicalAssessment.technicalWarnings);
  errors.push(...technicalAssessment.technicalErrors);

  const similarUpload = previousUploads.find((upload) => {
    if (isMultiAngle) {
      const previousAngles = upload.angleClips?.map((item) => normalise(item.angle)).sort().join('|') || '';
      const currentAngles = capturedAngles.slice().sort().join('|');
      const createdAt = upload.createdAt ? new Date(upload.createdAt).getTime() : 0;
      return previousAngles === currentAngles && Date.now() - createdAt < 12 * 60 * 60 * 1000;
    }

    const sameFileName = upload.originalFileName === file?.originalname;
    const sameFileSize = Math.abs(safeNumber(upload.fileSize, 0) - safeNumber(file?.size, 0)) < 1024;
    const createdAt = upload.createdAt ? new Date(upload.createdAt).getTime() : 0;
    return sameFileName && sameFileSize && Date.now() - createdAt < 12 * 60 * 60 * 1000;
  });

  if (similarUpload) {
    warnings.push('A very similar upload was detected recently. Consider uploading a new monthly comparison clip.');
  }

  let submissionQuality = 'High';

  if (errors.length > 0) {
    submissionQuality = 'Needs Improvement';
  } else if (warnings.length >= 3 || metadataCompleteness < 100 || technicalAssessment.technicalScore < 80) {
    submissionQuality = 'Acceptable';
  }

  if (warnings.length >= 5 || technicalAssessment.technicalScore < 60) {
    submissionQuality = 'Needs Improvement';
  }

  const requiresManualReview =
    submissionQuality === 'Needs Improvement' ||
    metadataCompleteness < 80 ||
    technicalAssessment.technicalScore < 65 ||
    missingAngles.length > 0;

  return {
    errors,
    warnings,
    metadataCompleteness,
    submissionQuality,
    requiresManualReview,
    videoTechnical: technicalAssessment,
    capturedAngles,
    missingAngles,
    isMultiAngle
  };
};

module.exports = {
  validateUploadSubmission,
  buildVideoTechnicalAssessment
};