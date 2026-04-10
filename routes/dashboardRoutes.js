const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Upload = require('../models/Upload');

const router = express.Router();

const average = (values = []) => {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const percentage = (part, total) => {
  if (!total) return 0;
  return Math.round((part / total) * 100);
};

const uniqueDayCount = (uploads = []) => {
  const days = new Set(
    uploads.map((item) => new Date(item.createdAt).toISOString().slice(0, 10))
  );
  return days.size;
};

router.get('/summary', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    const uploads = await Upload.find({ owner: req.user._id })
      .populate('dogProfile', 'name breed')
      .sort({ createdAt: -1 });

    const latestUpload = uploads[0] || null;
    const healthScores = uploads.map((item) => item.healthScore || 0);
    const confidenceScores = uploads.map((item) => item.confidenceScore || 0);
    const metadataScores = uploads.map((item) => item.validation?.metadataCompleteness || 0);
    const technicalScores = uploads.map((item) => item.videoTechnical?.technicalScore || 0);
    const processingTimes = uploads.map((item) => item.metrics?.processingTimeMs || 0).filter(Boolean);
    const uploadDurations = uploads
      .map((item) => item.metrics?.uploadDurationSeconds || 0)
      .filter((value) => value > 0);

    const last30DaysCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const uploadsLast30Days = uploads.filter((item) => new Date(item.createdAt) >= last30DaysCutoff);

    const healthTrends = uploads
      .slice()
      .reverse()
      .map((item) => ({
        date: new Date(item.createdAt).toISOString().slice(0, 10),
        label: new Date(item.createdAt).toLocaleDateString(),
        score: item.healthScore || 0,
        confidence: item.confidenceScore || 0,
        quality: item.qualityScore || 0,
        technicalScore: item.videoTechnical?.technicalScore || 0
      }));

    const breedAverages = await Upload.aggregate([
      {
        $lookup: {
          from: 'dogprofiles',
          localField: 'dogProfile',
          foreignField: '_id',
          as: 'dogProfileData'
        }
      },
      { $unwind: '$dogProfileData' },
      {
        $group: {
          _id: '$dogProfileData.breed',
          averageHealthScore: { $avg: '$healthScore' },
          sampleCount: { $sum: 1 }
        }
      },
      { $sort: { averageHealthScore: -1 } },
      { $limit: 5 }
    ]);

    const breedComparison = breedAverages.map((item) => ({
      breed: item._id || 'Unknown',
      score: Math.round(item.averageHealthScore || 0),
      sampleCount: item.sampleCount
    }));

    const averageMetadataCompleteness = average(metadataScores);
    const averageScore = average(healthScores);
    const bestScore = healthScores.length ? Math.max(...healthScores) : 0;
    const averageConfidenceScore = average(confidenceScores);

    const leaderboardRank = await User.countDocuments({ totalPoints: { $gt: user?.totalPoints || 0 } });

    res.json({
      summary: {
        totalUploads: uploads.length,
        uploadCount: uploads.length,
        totalPoints: user?.totalPoints || 0,
        currentStreak: user?.currentStreak || 0,
        badges: user?.badges || [],
        uploadCountLifetime: user?.uploadCount || uploads.length,
        latestHealthScore: latestUpload?.healthScore || 0,
        latestConfidenceScore: latestUpload?.confidenceScore || 0,
        latestRiskLevel: latestUpload?.riskLevel || 'Moderate',
        latestTrend: latestUpload?.trend || 'Baseline',
        latestSubmissionQuality: latestUpload?.validation?.submissionQuality || 'Acceptable',
        latestTechnicalScore: latestUpload?.videoTechnical?.technicalScore || 0,
        latestUploadDurationSeconds: latestUpload?.metrics?.uploadDurationSeconds || 0,
        averageMetadataCompleteness,
        averageTechnicalScore: average(technicalScores),
        averageUploadDurationSeconds: average(uploadDurations),
        averageProcessingTimeMs: average(processingTimes),
        uploadsWithin30SecondsRate: percentage(
          uploads.filter((item) => (item.metrics?.uploadDurationSeconds || 0) > 0 && (item.metrics?.uploadDurationSeconds || 0) <= 30).length,
          uploadDurations.length
        ),
        metadataAbove90Rate: percentage(
          uploads.filter((item) => (item.validation?.metadataCompleteness || 0) >= 90).length,
          uploads.length
        ),
        monthlyUploads: uploadsLast30Days.length,
        monthlyEngagementActive: uploadsLast30Days.length > 0,
        reportGenerationRate: percentage(
          uploads.filter((item) => item.metrics?.reportGenerationSuccess).length,
          uploads.length
        ),
        averageScore,
        bestScore,
        averageConfidenceScore,
        daysActive: uniqueDayCount(uploads),
        leaderboardPosition: leaderboardRank + 1,
        latestComparison: latestUpload?.comparison || null,
        latestEngagementAward: latestUpload?.engagementAward || null
      },
      healthTrends,
      breedComparison,
      uploads,
      engagement: {
        totalPoints: user?.totalPoints || 0,
        currentStreak: user?.currentStreak || 0,
        badges: user?.badges || [],
        uploadCount: user?.uploadCount || uploads.length
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
