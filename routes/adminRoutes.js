const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const User = require('../models/User');
const DogProfile = require('../models/DogProfile');
const Upload = require('../models/Upload');
const Consent = require('../models/Consent');
const { rowsToCSV } = require('../utils/csv');
const { recordAudit } = require('../utils/audit');
const { analyzeSubmission } = require('../services/healthAnalysisService');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

const formatAgeGroup = (dogProfile = {}) => {
  const rawAge = dogProfile.age ?? dogProfile.ageYears ?? null;
  const age = Number(rawAge);

  if (!Number.isFinite(age)) return 'Unknown';
  if (age < 1) return 'Puppy';
  if (age < 4) return 'Young Adult';
  if (age < 8) return 'Adult';
  return 'Senior';
};

const getConditionList = (dogProfile = {}) => {
  if (Array.isArray(dogProfile.existingConditions)) {
    return dogProfile.existingConditions.filter(Boolean);
  }

  if (typeof dogProfile.existingConditions === 'string') {
    return dogProfile.existingConditions
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const average = (arr = []) => {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((sum, value) => sum + value, 0) / arr.length);
};

const countBy = (items = [], keyGetter) => {
  const result = {};
  items.forEach((item) => {
    const key = keyGetter(item) || 'Unknown';
    result[key] = (result[key] || 0) + 1;
  });
  return result;
};

const uniqueSortedValues = (values = []) =>
  [...new Set(values.filter(Boolean).map((item) => String(item).trim()))].sort((a, b) => a.localeCompare(b));

const matchesFilter = (value, expected) => {
  if (!expected || expected === 'all') return true;
  return String(value || '').toLowerCase() === String(expected).toLowerCase();
};

const filterUploads = (uploads = [], query = {}) => {
  return uploads.filter((upload) => {
    const breed = upload.dogProfile?.breed || upload.breed || '-';
    const suburb = upload.owner?.suburb || upload.suburb || '-';
    const riskLevel = upload.riskLevel || upload.latestRiskLevel || 'Moderate';
    const reviewStatus = upload.reviewStatus || 'pending';

    return (
      matchesFilter(breed, query.breed) &&
      matchesFilter(suburb, query.suburb) &&
      matchesFilter(riskLevel, query.riskLevel) &&
      matchesFilter(reviewStatus, query.reviewStatus)
    );
  });
};

const sendCSV = (res, filename, rows) => {
  const csv = rowsToCSV(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
};

router.get('/summary', async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalAdmins,
      totalProfiles,
      totalUploads,
      totalConsents,
      pendingReviews,
      averageHealthResult,
      latestUsers,
      recentUploads
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'admin' }),
      DogProfile.countDocuments(),
      Upload.countDocuments(),
      Consent.countDocuments(),
      Upload.countDocuments({ reviewStatus: { $in: ['pending', 'under-review'] } }),
      Upload.aggregate([
        {
          $group: {
            _id: null,
            averageHealthScore: { $avg: '$healthScore' }
          }
        }
      ]),
      User.find({})
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(5),
      Upload.find({})
        .populate('owner', 'name email role')
        .populate('dogProfile', 'name breed')
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    const reviewBreakdownAgg = await Upload.aggregate([
      {
        $group: {
          _id: '$reviewStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const reviewBreakdown = {
      pending: 0,
      'under-review': 0,
      approved: 0,
      rejected: 0
    };

    reviewBreakdownAgg.forEach((item) => {
      reviewBreakdown[item._id] = item.count;
    });

    res.json({
      stats: {
        totalUsers,
        totalAdmins,
        totalProfiles,
        totalUploads,
        totalConsents,
        pendingReviews,
        averageHealthScore: averageHealthResult[0]?.averageHealthScore
          ? Math.round(averageHealthResult[0].averageHealthScore)
          : 0
      },
      reviewBreakdown,
      latestUsers,
      recentUploads
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const [profiles, uploadCount] = await Promise.all([
          DogProfile.find({ owner: user._id }).select('name breed isPrimary').sort({ isPrimary: -1, createdAt: -1 }),
          Upload.countDocuments({ owner: user._id })
        ]);

        return {
          ...user,
          profile: profiles[0] || null,
          profiles,
          profileCount: profiles.length,
          uploadCount
        };
      })
    );

    res.json({ users: enrichedUsers });
  } catch (error) {
    next(error);
  }
});

router.get('/uploads', async (req, res, next) => {
  try {
    const uploads = await Upload.find({})
      .populate('owner', 'name email role suburb')
      .populate('dogProfile', 'name breed age dateOfBirth weight existingConditions')
      .populate('consent')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ uploads });
  } catch (error) {
    next(error);
  }
});

router.get('/consents', async (req, res, next) => {
  try {
    const consents = await Consent.find({})
      .populate('owner', 'name email suburb')
      .populate('dogProfile', 'name breed')
      .sort({ createdAt: -1 });

    res.json({ consents });
  } catch (error) {
    next(error);
  }
});

router.patch('/uploads/:id/review', async (req, res, next) => {
  try {
    const { reviewStatus, adminFeedback } = req.body;

    const allowedStatuses = ['pending', 'under-review', 'approved', 'rejected'];
    if (!allowedStatuses.includes(reviewStatus)) {
      return res.status(400).json({ message: 'Invalid review status.' });
    }

    const upload = await Upload.findById(req.params.id).populate('dogProfile');
    if (!upload) {
      return res.status(404).json({ message: 'Upload not found.' });
    }

    const previousUploads = await Upload.find({
      owner: upload.owner,
      dogProfile: upload.dogProfile._id,
      _id: { $ne: upload._id }
    })
      .sort({ createdAt: -1 })
      .limit(5);

    const analysis = analyzeSubmission({
      dogProfile: upload.dogProfile,
      metadata: upload.metadata,
      videoTechnical: upload.videoTechnical || {},
      previousUploads,
      reviewStatus,
      validation: upload.validation || {}
    });

    upload.reviewStatus = reviewStatus;
    upload.adminFeedback = adminFeedback ? adminFeedback.trim() : '';
    upload.reviewedAt = new Date();
    upload.reviewedBy = req.user._id;
    upload.metrics.reportGeneratedAt = new Date();
    upload.metrics.reportGenerationSuccess = true;

    if (reviewStatus === 'approved') {
      upload.validation.requiresManualReview = false;
    }

    if (reviewStatus === 'rejected') {
      upload.validation.requiresManualReview = true;
    }

    upload.healthScore = analysis.healthScore;
    upload.confidenceScore = analysis.confidenceScore;
    upload.qualityScore = analysis.qualityScore;
    upload.trend = analysis.trend;
    upload.overallStatus = analysis.overallStatus;
    upload.riskLevel = analysis.riskLevel;
    upload.recommendations = analysis.recommendations;
    upload.analysisNotes = analysis.analysisNotes;
    upload.comparison = analysis.comparison;

    await upload.save();

    await recordAudit({
      req,
      actor: req.user,
      action: 'upload.review_updated',
      entityType: 'Upload',
      entityId: upload._id,
      details: {
        reviewStatus,
        adminFeedback: upload.adminFeedback,
        healthScore: upload.healthScore,
        confidenceScore: upload.confidenceScore
      }
    });

    const populatedUpload = await Upload.findById(upload._id)
      .populate('owner', 'name email role suburb')
      .populate('dogProfile', 'name breed age dateOfBirth weight existingConditions isPrimary')
      .populate('consent')
      .populate('reviewedBy', 'name email');

    res.json({
      message: 'Upload review updated successfully.',
      upload: populatedUpload
    });
  } catch (error) {
    next(error);
  }
});

router.get('/vet-view', async (req, res, next) => {
  try {
    const uploads = await Upload.find({})
      .populate('owner', 'name email suburb')
      .populate('dogProfile', 'name breed age dateOfBirth weight existingConditions')
      .sort({ createdAt: -1 });

    const filterOptions = {
      breeds: uniqueSortedValues(uploads.map((item) => item.dogProfile?.breed)),
      suburbs: uniqueSortedValues(uploads.map((item) => item.owner?.suburb)),
      riskLevels: uniqueSortedValues(uploads.map((item) => item.riskLevel)),
      reviewStatuses: uniqueSortedValues(uploads.map((item) => item.reviewStatus))
    };

    const latestByDog = new Map();
    uploads.forEach((upload) => {
      const dogId = String(upload.dogProfile?._id || upload._id);
      if (!latestByDog.has(dogId)) {
        latestByDog.set(dogId, upload);
      }
    });

    let dogCases = await Promise.all(
      Array.from(latestByDog.values()).map(async (latestUpload) => {
        const dogId = latestUpload.dogProfile?._id;
        const history = await Upload.find({ dogProfile: dogId })
          .sort({ createdAt: -1 })
          .limit(6);

        return {
          dogId,
          ownerName: latestUpload.owner?.name || '-',
          ownerEmail: latestUpload.owner?.email || '-',
          suburb: latestUpload.owner?.suburb || '-',
          dogName: latestUpload.dogProfile?.name || '-',
          breed: latestUpload.dogProfile?.breed || '-',
          ageGroup: formatAgeGroup(latestUpload.dogProfile),
          weight: latestUpload.dogProfile?.weight ?? '-',
          existingConditions: getConditionList(latestUpload.dogProfile),
          latestHealthScore: latestUpload.healthScore || 0,
          latestConfidenceScore: latestUpload.confidenceScore || 0,
          latestTrend: latestUpload.trend || 'Baseline',
          latestRiskLevel: latestUpload.riskLevel || 'Moderate',
          overallStatus: latestUpload.overallStatus || 'Monitor',
          reviewStatus: latestUpload.reviewStatus || 'pending',
          recommendations: latestUpload.recommendations || [],
          analysisNotes: latestUpload.analysisNotes || [],
          repeatedQualityIssues: latestUpload.comparison?.repeatedQualityIssues || [],
          longitudinalSummary: latestUpload.comparison?.longitudinalSummary || '',
          uploadHistory: history.map((item) => ({
            uploadId: item._id,
            uploadedAt: item.createdAt,
            healthScore: item.healthScore,
            confidenceScore: item.confidenceScore,
            trend: item.trend,
            riskLevel: item.riskLevel,
            reviewStatus: item.reviewStatus
          }))
        };
      })
    );

    dogCases = filterUploads(dogCases, req.query);

    if (req.query.export === 'csv') {
      return sendCSV(
        res,
        'vet-view-export.csv',
        dogCases.map((item) => ({
          dogName: item.dogName,
          breed: item.breed,
          suburb: item.suburb,
          ownerName: item.ownerName,
          latestHealthScore: item.latestHealthScore,
          latestConfidenceScore: item.latestConfidenceScore,
          latestRiskLevel: item.latestRiskLevel,
          latestTrend: item.latestTrend,
          reviewStatus: item.reviewStatus,
          repeatedQualityIssues: item.repeatedQualityIssues.join(' | ')
        }))
      );
    }

    res.json({
      filters: filterOptions,
      summary: {
        totalCases: dogCases.length,
        averageHealthScore: average(dogCases.map((item) => item.latestHealthScore || 0)),
        elevatedRiskCases: dogCases.filter((item) => item.latestRiskLevel === 'Elevated').length,
        underReviewCases: dogCases.filter((item) =>
          ['pending', 'under-review'].includes(item.reviewStatus)
        ).length,
        breedBreakdown: countBy(dogCases, (item) => item.breed),
        suburbBreakdown: countBy(dogCases, (item) => item.suburb)
      },
      cases: dogCases
    });
  } catch (error) {
    next(error);
  }
});

router.get('/research-view', async (req, res, next) => {
  try {
    const uploads = await Upload.find({})
      .populate('owner', 'suburb')
      .populate('dogProfile', 'breed age dateOfBirth weight existingConditions')
      .sort({ createdAt: -1 });

    const filterOptions = {
      breeds: uniqueSortedValues(uploads.map((item) => item.dogProfile?.breed)),
      suburbs: uniqueSortedValues(uploads.map((item) => item.owner?.suburb)),
      riskLevels: uniqueSortedValues(uploads.map((item) => item.riskLevel)),
      reviewStatuses: uniqueSortedValues(uploads.map((item) => item.reviewStatus))
    };

    let anonymizedRecords = uploads.map((upload, index) => ({
      recordId: `REC-${String(index + 1).padStart(4, '0')}`,
      suburb: upload.owner?.suburb || '-',
      breed: upload.dogProfile?.breed || 'Unknown',
      ageGroup: formatAgeGroup(upload.dogProfile),
      weight: upload.dogProfile?.weight ?? null,
      riskLevel: upload.riskLevel || 'Moderate',
      trend: upload.trend || 'Baseline',
      overallStatus: upload.overallStatus || 'Monitor',
      healthScore: upload.healthScore || 0,
      confidenceScore: upload.confidenceScore || 0,
      qualityScore: upload.qualityScore || 0,
      movementType: upload.metadata?.movementType || '-',
      surfaceType: upload.metadata?.surfaceType || '-',
      lightingConditions: upload.metadata?.lightingConditions || '-',
      reviewStatus: upload.reviewStatus || 'pending',
      repeatedQualityIssues: upload.comparison?.repeatedQualityIssues || [],
      uploadedAt: upload.createdAt
    }));

    anonymizedRecords = filterUploads(anonymizedRecords, req.query);

    if (req.query.export === 'csv') {
      return sendCSV(
        res,
        'research-view-export.csv',
        anonymizedRecords.map((item) => ({
          recordId: item.recordId,
          suburb: item.suburb,
          breed: item.breed,
          ageGroup: item.ageGroup,
          healthScore: item.healthScore,
          confidenceScore: item.confidenceScore,
          riskLevel: item.riskLevel,
          trend: item.trend,
          movementType: item.movementType,
          surfaceType: item.surfaceType,
          reviewStatus: item.reviewStatus,
          repeatedQualityIssues: item.repeatedQualityIssues.join(' | '),
          uploadedAt: item.uploadedAt
        }))
      );
    }

    res.json({
      filters: filterOptions,
      summary: {
        totalRecords: anonymizedRecords.length,
        approvedRecords: anonymizedRecords.filter((item) => item.reviewStatus === 'approved').length,
        averageHealthScore: average(anonymizedRecords.map((item) => item.healthScore)),
        averageConfidenceScore: average(anonymizedRecords.map((item) => item.confidenceScore)),
        breedDistribution: countBy(anonymizedRecords, (item) => item.breed),
        riskDistribution: countBy(anonymizedRecords, (item) => item.riskLevel),
        suburbDistribution: countBy(anonymizedRecords, (item) => item.suburb)
      },
      records: anonymizedRecords
    });
  } catch (error) {
    next(error);
  }
});

router.get('/insurance-view', async (req, res, next) => {
  try {
    const uploads = await Upload.find({})
      .populate('owner', 'suburb')
      .populate('dogProfile', 'name breed age dateOfBirth weight')
      .sort({ createdAt: -1 });

    const filterOptions = {
      breeds: uniqueSortedValues(uploads.map((item) => item.dogProfile?.breed)),
      suburbs: uniqueSortedValues(uploads.map((item) => item.owner?.suburb)),
      riskLevels: uniqueSortedValues(uploads.map((item) => item.riskLevel)),
      reviewStatuses: uniqueSortedValues(uploads.map((item) => item.reviewStatus))
    };

    const byDog = new Map();
    uploads.forEach((upload) => {
      const dogId = String(upload.dogProfile?._id || upload._id);
      if (!byDog.has(dogId)) {
        byDog.set(dogId, []);
      }
      byDog.get(dogId).push(upload);
    });

    let cases = Array.from(byDog.entries()).map(([dogId, dogUploads], index) => {
      const sortedUploads = dogUploads.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const latest = sortedUploads[0];
      const oldest = sortedUploads[sortedUploads.length - 1];

      const spanDays =
        sortedUploads.length > 1
          ? Math.round(
              (new Date(latest.createdAt).getTime() - new Date(oldest.createdAt).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 0;

      const frequencyLabel =
        sortedUploads.length >= 4
          ? 'Consistent'
          : sortedUploads.length >= 2
          ? 'Moderate'
          : 'Limited';

      return {
        caseRef: `CASE-${String(index + 1).padStart(4, '0')}`,
        dogId,
        dogName: latest.dogProfile?.name || '-',
        breed: latest.dogProfile?.breed || '-',
        ageGroup: formatAgeGroup(latest.dogProfile),
        suburb: latest.owner?.suburb || '-',
        latestHealthScore: latest.healthScore || 0,
        latestConfidenceScore: latest.confidenceScore || 0,
        latestTrend: latest.trend || 'Baseline',
        latestRiskLevel: latest.riskLevel || 'Moderate',
        overallStatus: latest.overallStatus || 'Monitor',
        uploadCount: sortedUploads.length,
        observationWindowDays: spanDays,
        uploadConsistency: frequencyLabel,
        lastUploadedAt: latest.createdAt,
        repeatedQualityIssues: latest.comparison?.repeatedQualityIssues || []
      };
    });

    cases = filterUploads(cases, req.query);

    if (req.query.export === 'csv') {
      return sendCSV(
        res,
        'insurance-view-export.csv',
        cases.map((item) => ({
          caseRef: item.caseRef,
          dogName: item.dogName,
          breed: item.breed,
          suburb: item.suburb,
          latestHealthScore: item.latestHealthScore,
          latestConfidenceScore: item.latestConfidenceScore,
          latestRiskLevel: item.latestRiskLevel,
          latestTrend: item.latestTrend,
          uploadConsistency: item.uploadConsistency,
          uploadCount: item.uploadCount,
          observationWindowDays: item.observationWindowDays,
          repeatedQualityIssues: item.repeatedQualityIssues.join(' | '),
          lastUploadedAt: item.lastUploadedAt
        }))
      );
    }

    res.json({
      filters: filterOptions,
      summary: {
        totalCases: cases.length,
        elevatedRiskCases: cases.filter((item) => item.latestRiskLevel === 'Elevated').length,
        stableCases: cases.filter((item) => item.latestTrend === 'Stable').length,
        improvingCases: cases.filter((item) => item.latestTrend === 'Improving').length,
        averageHealthScore: average(cases.map((item) => item.latestHealthScore)),
        breedBreakdown: countBy(cases, (item) => item.breed),
        suburbBreakdown: countBy(cases, (item) => item.suburb),
        riskBreakdown: countBy(cases, (item) => item.latestRiskLevel)
      },
      cases
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
