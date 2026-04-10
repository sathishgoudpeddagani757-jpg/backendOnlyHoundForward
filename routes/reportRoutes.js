const express = require('express');
const authMiddleware = require('../middleware/auth');
const Upload = require('../models/Upload');

const router = express.Router();

const average = (values = []) => {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const buildAngleClipSummary = (upload) => {
  return (upload.angleClips || []).map((clip) => ({
    angle: clip.angle,
    originalFileName: clip.originalFileName,
    fileSize: clip.fileSize,
    mimeType: clip.mimeType,
    videoTechnical: clip.videoTechnical || {}
  }));
};

router.get('/basic', authMiddleware, async (req, res, next) => {
  try {
    const latestUpload = await Upload.findOne({ owner: req.user._id })
      .populate('dogProfile', 'name breed age dateOfBirth weight coatType sex existingConditions')
      .sort({ createdAt: -1 });

    if (!latestUpload) {
      return res.status(404).json({ message: 'No reports available yet.' });
    }

    latestUpload.metrics.reportGeneratedAt = new Date();
    latestUpload.metrics.reportGenerationSuccess = true;
    await latestUpload.save();

    res.json({
      report: {
        uploadId: latestUpload._id,
        dogName: latestUpload.dogProfile?.name || 'Dog',
        breed: latestUpload.dogProfile?.breed || '-',
        uploadedAt: latestUpload.createdAt,
        healthScore: latestUpload.healthScore,
        confidenceScore: latestUpload.confidenceScore,
        qualityScore: latestUpload.qualityScore,
        trend: latestUpload.trend,
        overallStatus: latestUpload.overallStatus,
        riskLevel: latestUpload.riskLevel,
        reviewStatus: latestUpload.reviewStatus,
        adminFeedback: latestUpload.adminFeedback || '',
        recommendations: latestUpload.recommendations || [],
        analysisNotes: latestUpload.analysisNotes || [],
        metadataCompleteness: latestUpload.validation?.metadataCompleteness || 0,
        submissionQuality: latestUpload.validation?.submissionQuality || 'Acceptable',
        validationWarnings: latestUpload.validation?.validationWarnings || [],
        videoTechnical: latestUpload.videoTechnical || {},
        metrics: latestUpload.metrics || {},
        comparison: latestUpload.comparison || null,
        engagementAward: latestUpload.engagementAward || null,
        captureMode: latestUpload.metadata?.captureMode || 'single-upload',
        recordingAngle: latestUpload.metadata?.recordingAngle || '',
        capturedAngles: latestUpload.validation?.capturedAngles || [],
        missingAngles: latestUpload.validation?.missingAngles || [],
        angleClips: buildAngleClipSummary(latestUpload)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/advanced', authMiddleware, async (req, res, next) => {
  try {
    const uploads = await Upload.find({ owner: req.user._id })
      .populate('dogProfile', 'name breed age dateOfBirth weight coatType sex existingConditions')
      .sort({ createdAt: -1 });

    if (!uploads.length) {
      return res.status(404).json({ message: 'No advanced report available yet.' });
    }

    const latest = uploads[0];
    latest.metrics.reportGeneratedAt = new Date();
    latest.metrics.reportGenerationSuccess = true;
    await latest.save();

    const history = uploads
      .slice()
      .reverse()
      .map((item) => ({
        uploadId: item._id,
        uploadedAt: item.createdAt,
        healthScore: item.healthScore,
        confidenceScore: item.confidenceScore,
        qualityScore: item.qualityScore,
        technicalScore: item.videoTechnical?.technicalScore || 0,
        trend: item.trend,
        overallStatus: item.overallStatus,
        riskLevel: item.riskLevel,
        metadataCompleteness: item.validation?.metadataCompleteness || 0,
        submissionQuality: item.validation?.submissionQuality || 'Acceptable',
        repeatedQualityIssues: item.comparison?.repeatedQualityIssues || [],
        longitudinalSummary: item.comparison?.longitudinalSummary || '',
        metrics: item.metrics || {},
        reviewStatus: item.reviewStatus || 'pending',
        adminFeedback: item.adminFeedback || '',
        captureMode: item.metadata?.captureMode || 'single-upload',
        capturedAngles: item.validation?.capturedAngles || []
      }));

    const allUploads = uploads.map((item) => ({
      uploadId: item._id,
      dogName: item.dogProfile?.name || 'Dog',
      breed: item.dogProfile?.breed || '-',
      uploadedAt: item.createdAt,
      healthScore: item.healthScore,
      confidenceScore: item.confidenceScore,
      qualityScore: item.qualityScore,
      trend: item.trend,
      overallStatus: item.overallStatus,
      riskLevel: item.riskLevel,
      reviewStatus: item.reviewStatus || 'pending',
      adminFeedback: item.adminFeedback || '',
      recommendations: item.recommendations || [],
      analysisNotes: item.analysisNotes || [],
      metadataCompleteness: item.validation?.metadataCompleteness || 0,
      submissionQuality: item.validation?.submissionQuality || 'Acceptable',
      validationWarnings: item.validation?.validationWarnings || [],
      metrics: item.metrics || {},
      comparison: item.comparison || null,
      engagementAward: item.engagementAward || null,
      captureMode: item.metadata?.captureMode || 'single-upload',
      recordingAngle: item.metadata?.recordingAngle || '',
      capturedAngles: item.validation?.capturedAngles || [],
      missingAngles: item.validation?.missingAngles || [],
      angleClips: buildAngleClipSummary(item)
    }));

    res.json({
      latestAnalysis: {
        uploadId: latest._id,
        recommendations: latest.recommendations || [],
        analysisNotes: latest.analysisNotes || [],
        videoTechnical: latest.videoTechnical || {},
        metrics: latest.metrics || {},
        comparison: latest.comparison || null,
        engagementAward: latest.engagementAward || null,
        adminFeedback: latest.adminFeedback || '',
        reviewStatus: latest.reviewStatus || 'pending',
        captureMode: latest.metadata?.captureMode || 'single-upload',
        recordingAngle: latest.metadata?.recordingAngle || '',
        capturedAngles: latest.validation?.capturedAngles || [],
        missingAngles: latest.validation?.missingAngles || [],
        angleClips: buildAngleClipSummary(latest)
      },
      comparison: {
        uploadsConsidered: uploads.length,
        averageHealthScore: average(uploads.map((item) => item.healthScore || 0)),
        averageConfidenceScore: average(uploads.map((item) => item.confidenceScore || 0)),
        averageMetadataCompleteness: average(
          uploads.map((item) => item.validation?.metadataCompleteness || 0)
        ),
        averageTechnicalScore: average(
          uploads.map((item) => item.videoTechnical?.technicalScore || 0)
        ),
        averageUploadDurationSeconds: average(
          uploads.map((item) => item.metrics?.uploadDurationSeconds || 0).filter(Boolean)
        ),
        bestHealthScore: Math.max(...uploads.map((item) => item.healthScore || 0)),
        repeatedQualityIssues: latest.comparison?.repeatedQualityIssues || []
      },
      history,
      allUploads
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;