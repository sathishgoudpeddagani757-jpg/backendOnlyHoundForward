const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normaliseText = (value = '') => String(value).trim().toLowerCase();

const extractAgeYears = (dogProfile) => {
  if (!dogProfile) return 0;
  if (dogProfile.age !== undefined && dogProfile.age !== null) {
    return safeNumber(dogProfile.age, 0);
  }
  return 0;
};

const extractConditions = (dogProfile) => {
  if (!dogProfile) return [];
  if (Array.isArray(dogProfile.existingConditions)) {
    return dogProfile.existingConditions.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof dogProfile.existingConditions === 'string') {
    return dogProfile.existingConditions
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normaliseValidation = (validation = {}) => ({
  metadataCompleteness: safeNumber(validation.metadataCompleteness, 0),
  submissionQuality: validation.submissionQuality || 'Acceptable',
  warnings: validation.warnings || validation.validationWarnings || []
});

const scoreMetadataQuality = (metadata = {}) => {
  let qualityScore = 50;
  let scoreModifier = 0;
  const notes = [];

  const angle = normaliseText(metadata.recordingAngle);
  const movement = normaliseText(metadata.movementType);
  const surface = normaliseText(metadata.surfaceType);
  const lighting = normaliseText(metadata.lightingConditions);

  if (angle === 'multi-angle-4-part') {
    qualityScore += 16;
    scoreModifier += 10;
    notes.push('Guided four-angle capture improves biomechanical coverage across the dog.');
  } else if (['side', 'side-on', 'side on'].includes(angle)) {
    qualityScore += 12;
    scoreModifier += 7;
    notes.push('Recording angle supports better gait comparison.');
  } else {
    qualityScore -= 7;
    scoreModifier -= 4;
    notes.push('Recording angle is less suitable than side-on for repeat monitoring.');
  }

  if (movement === 'walk') {
    qualityScore += 10;
    scoreModifier += 6;
    notes.push('Walking movement is suitable for baseline comparison.');
  } else if (movement === 'trot') {
    qualityScore += 5;
    scoreModifier += 3;
    notes.push('Trot movement is usable for observation.');
  } else {
    qualityScore -= 4;
    scoreModifier -= 2;
    notes.push('Movement type may reduce comparison consistency.');
  }

  if (['grass', 'concrete', 'pavement', 'indoor-flat', 'indoor flat', 'flat', 'tile'].includes(surface)) {
    qualityScore += 8;
    scoreModifier += 4;
    notes.push('Surface is suitable for repeat monitoring.');
  } else {
    qualityScore -= 8;
    scoreModifier -= 5;
    notes.push('Uneven or unstable surface may affect movement interpretation.');
  }

  if (['daylight', 'bright-indoor', 'bright indoor', 'normal', 'bright'].includes(lighting)) {
    qualityScore += 8;
    scoreModifier += 4;
    notes.push('Lighting quality supports clearer observation.');
  } else {
    qualityScore -= 8;
    scoreModifier -= 5;
    notes.push('Poor lighting reduces confidence in the observation.');
  }

  if (metadata.notes && String(metadata.notes).trim()) {
    qualityScore += 2;
    scoreModifier += 1;
    notes.push('Owner notes provide additional useful context.');
  }

  qualityScore = clamp(Math.round(qualityScore), 30, 95);

  return {
    qualityScore,
    scoreModifier,
    notes
  };
};

const scoreVideoTechnical = (videoTechnical = {}) => {
  let qualityScore = safeNumber(videoTechnical.technicalScore, 70) || 70;
  let scoreModifier = 0;
  const notes = [];

  const durationSeconds = safeNumber(videoTechnical.durationSeconds, 0);
  const width = safeNumber(videoTechnical.width, 0);
  const height = safeNumber(videoTechnical.height, 0);
  const orientation = String(videoTechnical.orientation || 'unknown');
  const bitrate = safeNumber(videoTechnical.estimatedBitrateKbps, 0);

  if (durationSeconds >= 8 && durationSeconds <= 30) {
    scoreModifier += 4;
    notes.push('Video duration is within the recommended gait capture range.');
  } else if (durationSeconds > 0 && durationSeconds < 8) {
    scoreModifier -= 5;
    notes.push('Shorter clip length reduces the strength of comparison.');
  } else if (durationSeconds > 30) {
    scoreModifier -= 2;
    notes.push('Longer clip length may include unnecessary movement noise.');
  }

  if (width >= 1280 && height >= 720) {
    scoreModifier += 3;
    notes.push('Higher video resolution supports clearer review.');
  } else if (width >= 640 && height >= 360) {
    scoreModifier += 1;
    notes.push('Video resolution is acceptable for MVP review.');
  } else if (width > 0 && height > 0) {
    scoreModifier -= 5;
    notes.push('Lower video resolution reduces confidence in capture quality.');
  }

  if (orientation === 'landscape') {
    scoreModifier += 2;
    notes.push('Landscape framing is suitable for gait observation.');
  } else if (orientation !== 'unknown') {
    scoreModifier -= 4;
    notes.push('Non-landscape framing may reduce full-body visibility.');
  }

  if (bitrate > 0 && bitrate < 500) {
    scoreModifier -= 3;
    notes.push('Compressed video quality may limit fine visual interpretation.');
  }

  qualityScore = clamp(Math.round(qualityScore), 25, 98);

  return {
    technicalScore: qualityScore,
    scoreModifier,
    notes
  };
};

const scoreDogContext = (dogProfile = {}) => {
  let scoreModifier = 0;
  const notes = [];

  const ageYears = extractAgeYears(dogProfile);
  const weight = safeNumber(dogProfile.weight, 0);
  const conditions = extractConditions(dogProfile);

  if (ageYears >= 9) {
    scoreModifier -= 8;
    notes.push('Senior age suggests closer monitoring is appropriate.');
  } else if (ageYears >= 6) {
    scoreModifier -= 4;
    notes.push('Adult-to-senior age suggests moderate monitoring needs.');
  }

  if (weight >= 40) {
    scoreModifier -= 4;
    notes.push('Higher weight may increase mobility strain.');
  } else if (weight >= 25) {
    scoreModifier -= 2;
    notes.push('Moderate weight should be considered in interpretation.');
  }

  if (conditions.length > 0) {
    scoreModifier -= 7;
    notes.push(`Existing condition history recorded: ${conditions.join(', ')}.`);
  }

  return {
    scoreModifier,
    notes,
    ageYears,
    weight,
    conditions
  };
};

const deriveTrend = (previousUploads = [], currentScore) => {
  if (!previousUploads.length) {
    return 'Baseline';
  }

  const latestPrevious = previousUploads[0];
  const latestPreviousScore = safeNumber(latestPrevious?.healthScore, NaN);
  const previousScores = previousUploads
    .map((item) => safeNumber(item.healthScore, NaN))
    .filter((value) => Number.isFinite(value));

  if (!Number.isFinite(latestPreviousScore) || !previousScores.length) {
    return 'Baseline';
  }

  const averagePrevious = previousScores.reduce((sum, value) => sum + value, 0) / previousScores.length;
  const deltaFromLatest = currentScore - latestPreviousScore;

  if (deltaFromLatest >= 4 && currentScore >= averagePrevious) {
    return 'Improving';
  }

  if (deltaFromLatest <= -4) {
    return 'Needs Attention';
  }

  return 'Stable';
};

const repeatedQualityIssues = (previousUploads = [], currentWarnings = []) => {
  const issueCounts = {};

  previousUploads.forEach((upload) => {
    (upload.validation?.validationWarnings || []).forEach((warning) => {
      issueCounts[warning] = (issueCounts[warning] || 0) + 1;
    });
  });

  currentWarnings.forEach((warning) => {
    issueCounts[warning] = (issueCounts[warning] || 0) + 1;
  });

  return Object.entries(issueCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([warning]) => warning);
};

const buildLongitudinalSummary = ({ previousUpload, healthScore, confidenceScore, repeatedIssues, trend }) => {
  if (!previousUpload) {
    return 'This is the first upload, so it acts as the baseline for future comparison.';
  }

  const scoreChange = healthScore - safeNumber(previousUpload.healthScore, 0);
  const confidenceChange = confidenceScore - safeNumber(previousUpload.confidenceScore, 0);
  const scoreDirection = scoreChange > 0 ? 'improved' : scoreChange < 0 ? 'declined' : 'held steady';
  const confidenceDirection = confidenceChange > 0 ? 'improved' : confidenceChange < 0 ? 'declined' : 'held steady';

  let summary = `Compared with the previous upload, the health score ${scoreDirection} by ${Math.abs(scoreChange)} points and confidence ${confidenceDirection} by ${Math.abs(confidenceChange)} points, giving an overall trend of ${trend}.`;

  if (repeatedIssues.length) {
    summary += ` Repeated quality issues detected: ${repeatedIssues.join('; ')}.`;
  }

  return summary;
};

const buildRecommendations = ({
  qualityScore,
  riskLevel,
  trend,
  metadata,
  dogContext,
  validation,
  videoTechnical,
  repeatedIssues = []
}) => {
  const recommendations = [];
  const angle = normaliseText(metadata.recordingAngle);
  const surface = normaliseText(metadata.surfaceType);
  const lighting = normaliseText(metadata.lightingConditions);

  if (angle === 'multi-angle-4-part') {
    recommendations.push('Continue using the guided four-angle workflow for consistent longitudinal comparison.');
  } else if (!['side', 'side-on', 'side on'].includes(angle)) {
    recommendations.push('Use a side-on angle for the next recording.');
  }

  if (!['grass', 'concrete', 'pavement', 'indoor-flat', 'indoor flat', 'flat', 'tile'].includes(surface)) {
    recommendations.push('Use a flatter and more stable surface for the next recording.');
  }

  if (!['daylight', 'bright-indoor', 'bright indoor', 'normal', 'bright'].includes(lighting)) {
    recommendations.push('Improve lighting to increase confidence in the next submission.');
  }

  if (safeNumber(videoTechnical.durationSeconds, 0) > 0 && safeNumber(videoTechnical.durationSeconds, 0) < 8) {
    recommendations.push('Record 8–30 seconds of continuous walking for better comparison.');
  }

  if (String(videoTechnical.orientation || 'unknown') !== 'landscape') {
    recommendations.push('Record in landscape mode so the dog stays fully visible.');
  }

  if (safeNumber(videoTechnical.width, 0) > 0 && safeNumber(videoTechnical.width, 0) < 640) {
    recommendations.push('Use a higher-resolution camera setting if available.');
  }

  if (dogContext.ageYears >= 9) {
    recommendations.push('Maintain regular monitoring because the dog is in a senior age group.');
  }

  if (dogContext.conditions.length > 0) {
    recommendations.push('Share the report with a veterinarian alongside the condition history.');
  }

  if (trend === 'Needs Attention') {
    recommendations.push('Repeat the upload next month to compare ongoing mobility changes.');
  }

  if (riskLevel === 'Elevated') {
    recommendations.push('Consider veterinary review if reduced comfort or mobility is observed.');
  }

  if (qualityScore < 60 || validation.submissionQuality === 'Needs Improvement') {
    recommendations.push('Improve submission quality before relying on the result for stronger comparison.');
  }

  if (repeatedIssues.length) {
    recommendations.push('Address repeated capture issues to improve longitudinal comparison quality.');
  }

  return [...new Set(recommendations)].slice(0, 7);
};

const analyzeSubmission = ({
  dogProfile,
  metadata,
  videoTechnical = {},
  previousUploads = [],
  reviewStatus = 'pending',
  validation = {}
}) => {
  const baseScore = 68;
  const normalisedValidation = normaliseValidation(validation);

  const metadataResult = scoreMetadataQuality(metadata);
  const technicalResult = scoreVideoTechnical(videoTechnical);
  const dogContext = scoreDogContext(dogProfile);
  const previousUpload = previousUploads[0] || null;

  let qualityScore = Math.round(metadataResult.qualityScore * 0.45 + technicalResult.technicalScore * 0.55);
  qualityScore = clamp(qualityScore, 25, 98);

  let healthScore =
    baseScore +
    metadataResult.scoreModifier +
    technicalResult.scoreModifier +
    dogContext.scoreModifier +
    Math.round((normalisedValidation.metadataCompleteness - 80) / 10);

  if (normalisedValidation.submissionQuality === 'Needs Improvement') {
    healthScore -= 6;
  }

  if (reviewStatus === 'approved') {
    healthScore += 3;
  } else if (reviewStatus === 'rejected') {
    healthScore -= 10;
  }

  healthScore = clamp(Math.round(healthScore), 25, 95);

  const trend = deriveTrend(previousUploads, healthScore);

  let confidenceScore = Math.round(
    qualityScore * 0.6 +
      normalisedValidation.metadataCompleteness * 0.25 +
      technicalResult.technicalScore * 0.15
  );

  if (normalisedValidation.submissionQuality === 'High') {
    confidenceScore += 5;
  } else if (normalisedValidation.submissionQuality === 'Needs Improvement') {
    confidenceScore -= 8;
  }

  if (reviewStatus === 'approved') {
    confidenceScore += 6;
  } else if (reviewStatus === 'rejected') {
    confidenceScore -= 10;
  }

  confidenceScore = clamp(Math.round(confidenceScore), 35, 98);

  let overallStatus = 'Monitor';
  let riskLevel = 'Moderate';

  if (healthScore >= 80) {
    overallStatus = 'Good';
    riskLevel = 'Low';
  } else if (healthScore >= 65) {
    overallStatus = 'Monitor';
    riskLevel = 'Moderate';
  } else {
    overallStatus = 'Needs Attention';
    riskLevel = 'Elevated';
  }

  const recurringIssues = repeatedQualityIssues(previousUploads, normalisedValidation.warnings || []);
  const analysisNotes = [
    ...metadataResult.notes,
    ...technicalResult.notes,
    ...dogContext.notes,
    `Submission quality classified as ${normalisedValidation.submissionQuality}.`,
    `Review status is currently ${reviewStatus}.`
  ].slice(0, 8);

  const recommendations = buildRecommendations({
    qualityScore,
    riskLevel,
    trend,
    metadata,
    dogContext,
    validation: normalisedValidation,
    videoTechnical,
    repeatedIssues: recurringIssues
  });

  return {
    healthScore,
    confidenceScore,
    qualityScore,
    trend,
    overallStatus,
    riskLevel,
    recommendations,
    analysisNotes,
    comparison: {
      previousHealthScore: previousUpload ? safeNumber(previousUpload.healthScore, null) : null,
      scoreChange: previousUpload ? healthScore - safeNumber(previousUpload.healthScore, 0) : 0,
      previousConfidenceScore: previousUpload ? safeNumber(previousUpload.confidenceScore, null) : null,
      confidenceChange: previousUpload ? confidenceScore - safeNumber(previousUpload.confidenceScore, 0) : 0,
      baselineAverageScore: previousUploads.length
        ? Math.round(
            previousUploads.reduce((sum, item) => sum + safeNumber(item.healthScore, 0), 0) /
              previousUploads.length
          )
        : null,
      repeatedQualityIssues: recurringIssues,
      longitudinalSummary: buildLongitudinalSummary({
        previousUpload,
        healthScore,
        confidenceScore,
        repeatedIssues: recurringIssues,
        trend
      })
    }
  };
};

module.exports = {
  analyzeSubmission
};