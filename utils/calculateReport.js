const getStatusFromScore = (score) => {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  return 'Needs Attention';
};

const getTrend = (scores) => {
  if (scores.length < 2) return 'Stable';
  const latest = scores[scores.length - 1];
  const previous = scores[scores.length - 2];

  if (latest > previous) return 'Improving';
  if (latest < previous) return 'Needs Attention';
  return 'Stable';
};

const calculateUploadInsights = (uploadCount, dogProfile) => {
  let score = 72;

  if (uploadCount >= 1) score += 5;
  if (uploadCount >= 3) score += 4;
  if (uploadCount >= 6) score += 3;

  if ((dogProfile.conditions || []).length > 0 && !(dogProfile.conditions || []).includes('None')) {
    score -= 5;
  }

  if (dogProfile.weightUnit === 'kg' && dogProfile.weight >= 10 && dogProfile.weight <= 40) {
    score += 3;
  }

  score = Math.max(55, Math.min(score, 95));
  return score;
};

const buildBasicReport = (dogProfile, uploads) => {
  const sorted = [...uploads].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const scores = sorted.map((upload) => upload.healthScore);
  const latest = sorted[sorted.length - 1];

  return {
    reportId: `basic-${latest?._id || 'draft'}`,
    generatedDate: new Date(),
    healthScore: latest?.healthScore || calculateUploadInsights(sorted.length, dogProfile),
    overallStatus: latest?.overallStatus || 'Good',
    recommendations: [
      'Continue recording monthly gait videos using the same angle and surface.',
      'Keep the dog profile up to date so reports remain reliable.',
      'Share the report with a veterinarian if the score drops or gait changes become visible.'
    ],
    previousScores: scores,
    trend: getTrend(scores),
    report_type: 'basic'
  };
};

const buildAdvancedReport = (dogProfile, uploads) => {
  const basic = buildBasicReport(dogProfile, uploads);
  const breedAverage = dogProfile.breed.toLowerCase().includes('golden') ? 84 : 82;

  return {
    ...basic,
    gaitAnalysis: {
      symmetry: basic.healthScore >= 85 ? 'Normal' : basic.healthScore >= 70 ? 'Slight variance' : 'Review recommended',
      stride: basic.healthScore >= 85 ? 'Consistent' : basic.healthScore >= 70 ? 'Moderately stable' : 'Irregular',
      posture: basic.healthScore >= 85 ? 'Good' : basic.healthScore >= 70 ? 'Monitor changes' : 'Needs review'
    },
    comparisons: {
      breedAverage,
      ageGroup: Math.max(70, breedAverage - 1),
      globalAverage: 80
    },
    sharable: true,
    pdfReady: false,
    report_type: 'advanced'
  };
};

module.exports = {
  calculateUploadInsights,
  buildBasicReport,
  buildAdvancedReport,
  getStatusFromScore,
  getTrend
};
