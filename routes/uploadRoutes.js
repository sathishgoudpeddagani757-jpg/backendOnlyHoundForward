const express = require("express");
const multer = require("multer");

const authMiddleware = require("../middleware/auth");
const DogProfile = require("../models/DogProfile");
const Upload = require("../models/Upload");
const Consent = require("../models/Consent");
const {
  validateUploadSubmission,
} = require("../services/submissionValidationService");
const { analyzeSubmission } = require("../services/healthAnalysisService");
const {
  uploadVideoBuffer,
  destroyVideoAssets,
  buildSignedVideoUrl,
} = require("../services/cloudinaryService");
const { applyUploadEngagement } = require("../services/gamificationService");
const { recordAudit } = require("../utils/audit");

const router = express.Router();
const CURRENT_CONSENT_VERSION = "2.0";
const DEFAULT_CONSENT_TEXT =
  "I confirm that I consent to the upload, review, secure storage, dashboard reporting, and optional anonymised research use of this canine mobility submission for the Hound Forward MVP.";
const REQUIRED_ANGLES = ["front", "left", "right", "rear"];
const ANGLE_FIELD_MAP = {
  front: "frontVideo",
  left: "leftVideo",
  right: "rightVideo",
  rear: "rearVideo",
};

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-msvideo",
    "video/mpeg",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only video files are allowed."));
  }
};

const uploader = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 4,
  },
  fileFilter,
});

const uploadFields = uploader.fields([
  { name: "video", maxCount: 1 },
  { name: "frontVideo", maxCount: 1 },
  { name: "leftVideo", maxCount: 1 },
  { name: "rightVideo", maxCount: 1 },
  { name: "rearVideo", maxCount: 1 },
]);

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeJsonParse = (value, fallback = {}) => {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const extractAllFiles = (filesMap = {}) =>
  Object.values(filesMap).flat().filter(Boolean);

const removeUploadedFiles = () => {};

const buildVideoTechnicalPayload = ({ file, body }) => {
  const width = safeNumber(body.videoWidth, 0);
  const height = safeNumber(body.videoHeight, 0);
  const durationSeconds = safeNumber(body.videoDurationSeconds, 0);

  let orientation = "unknown";
  if (width > height) orientation = "landscape";
  else if (height > width) orientation = "portrait";
  else if (width > 0 && height > 0) orientation = "square";

  return {
    durationSeconds,
    width,
    height,
    orientation,
    aspectRatio:
      width > 0 && height > 0 ? Number((width / height).toFixed(2)) : 0,
    estimatedBitrateKbps:
      durationSeconds > 0
        ? Math.round((safeNumber(file?.size, 0) * 8) / 1000 / durationSeconds)
        : 0,
  };
};

const buildMetricsPayload = (uploadStartedAtRaw, processingStartedAt) => {
  const uploadCompletedAt = new Date();
  const parsedStart = uploadStartedAtRaw
    ? new Date(uploadStartedAtRaw)
    : uploadCompletedAt;
  const uploadStartedAt = Number.isNaN(parsedStart.getTime())
    ? uploadCompletedAt
    : parsedStart;
  const uploadDurationSeconds = Math.max(
    0,
    Number(
      (
        (uploadCompletedAt.getTime() - uploadStartedAt.getTime()) /
        1000
      ).toFixed(2),
    ),
  );

  return {
    uploadStartedAt,
    uploadCompletedAt,
    uploadDurationSeconds,
    processingTimeMs: Date.now() - processingStartedAt,
    reportGeneratedAt: uploadCompletedAt,
    reportGenerationSuccess: true,
  };
};

const buildAngleClips = ({ filesMap = {}, rawAngleTechnical = {} }) => {
  return REQUIRED_ANGLES.map((angle) => {
    const fieldName = ANGLE_FIELD_MAP[angle];
    const file = filesMap?.[fieldName]?.[0];
    if (!file) return null;

    return {
      angle,
      file,
      videoTechnical: buildVideoTechnicalPayload({
        file,
        body: rawAngleTechnical?.[angle] || {},
      }),
    };
  }).filter(Boolean);
};

const buildStoredAngleClipDocs = (storedAngleClips = []) =>
  storedAngleClips.map((clip) => ({
    angle: clip.angle,
    storageKey: clip.storageKey,
    storagePath: clip.storagePath,
    cloudinaryVersion: clip.cloudinaryVersion || null,
    cloudinaryFormat: clip.cloudinaryFormat || "",
    originalFileName: clip.originalFileName,
    mimeType: clip.mimeType,
    fileSize: clip.fileSize,
    videoTechnical: clip.videoTechnical,
  }));

const choosePrimaryFile = ({ singleFile, angleClips = [] }) => {
  if (singleFile) return singleFile;

  const preferred =
    angleClips.find((clip) => clip.angle === "left") || angleClips[0];
  return preferred?.file || null;
};

const choosePrimaryAngleDoc = (angleDocs = []) => {
  return (
    angleDocs.find((clip) => clip.angle === "left") || angleDocs[0] || null
  );
};

const buildPrimaryFileName = ({ singleFile, isMultiAngle, dogProfile }) => {
  if (!isMultiAngle) {
    return singleFile?.originalname || "upload-video.mp4";
  }

  const safeDogName = String(dogProfile?.name || "dog")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${safeDogName}-multi-angle-submission.mp4`;
};

const getRequestedFileEntry = (upload, requestedAngle) => {
  if (requestedAngle) {
    return (
      upload.angleClips?.find((clip) => clip.angle === requestedAngle) || null
    );
  }

  return {
    storageKey: upload.storageKey,
    storagePath: upload.storagePath,
    cloudinaryVersion: upload.cloudinaryVersion,
    cloudinaryFormat: upload.cloudinaryFormat,
    mimeType: upload.mimeType,
    originalFileName: upload.originalFileName,
  };
};

const uploadValidatedFilesToCloudinary = async ({
  singleFile,
  angleClips = [],
  isMultiAngle,
  dogProfile,
  ownerId,
}) => {
  if (isMultiAngle) {
    const storedAngleClips = await Promise.all(
      angleClips.map(async (clip) => {
        const uploaded = await uploadVideoBuffer(clip.file, {
          tags: ["hound-forward", "upload", "multi-angle", clip.angle],
          context: {
            ownerId: String(ownerId || ""),
            dogName: String(dogProfile?.name || ""),
            angle: clip.angle,
          },
        });

        return {
          angle: clip.angle,
          storageKey: uploaded.publicId,
          storagePath: uploaded.publicId,
          cloudinaryVersion: uploaded.version || null,
          cloudinaryFormat: uploaded.format || "",
          originalFileName: clip.file.originalname,
          mimeType: clip.file.mimetype,
          fileSize: clip.file.size,
          videoTechnical: clip.videoTechnical,
        };
      }),
    );

    return {
      storedAngleClips,
      primaryStoredFile:
        storedAngleClips.find((clip) => clip.angle === "left") ||
        storedAngleClips[0] ||
        null,
    };
  }

  const uploaded = await uploadVideoBuffer(singleFile, {
    tags: ["hound-forward", "upload", "single-video"],
    context: {
      ownerId: String(ownerId || ""),
      dogName: String(dogProfile?.name || ""),
    },
  });

  return {
    storedAngleClips: [],
    primaryStoredFile: {
      storageKey: uploaded.publicId,
      storagePath: uploaded.publicId,
      cloudinaryVersion: uploaded.version || null,
      cloudinaryFormat: uploaded.format || "",
      originalFileName: singleFile.originalname,
      mimeType: singleFile.mimetype,
      fileSize: singleFile.size,
    },
  };
};

router.post("/", authMiddleware, uploadFields, async (req, res, next) => {
  const processingStartedAt = Date.now();

  try {
    const {
      dogProfileId,
      recordingAngle,
      movementType,
      surfaceType,
      lightingConditions,
      notes,
      consentAccepted,
      consentText,
      consentVersion,
      researchAllowed,
      uploadStartedAt,
      captureMode,
    } = req.body;

    const singleFile = req.files?.video?.[0] || null;
    const rawAngleTechnical = safeJsonParse(req.body.angleTechnical, {});
    const angleClips = buildAngleClips({
      filesMap: req.files,
      rawAngleTechnical,
    });
    const isMultiAngle =
      String(captureMode || "").trim() === "guided-multi-angle" ||
      angleClips.length > 0;
    const primaryFile = choosePrimaryFile({ singleFile, angleClips });

    const dogProfile = await DogProfile.findOne({
      _id: dogProfileId,
      owner: req.user._id,
    });

    const previousUploads = await Upload.find({
      owner: req.user._id,
      dogProfile: dogProfileId,
    })
      .sort({ createdAt: -1 })
      .limit(5);

    const metadata = {
      recordingAngle: isMultiAngle ? "multi-angle-4-part" : recordingAngle,
      movementType,
      surfaceType,
      lightingConditions,
      notes,
      captureMode: isMultiAngle ? "guided-multi-angle" : "single-upload",
      requiredAnglesCaptured:
        isMultiAngle && angleClips.length === REQUIRED_ANGLES.length,
      angleSequence: isMultiAngle ? REQUIRED_ANGLES : [],
    };

    const videoTechnical = isMultiAngle
      ? {}
      : buildVideoTechnicalPayload({ file: singleFile, body: req.body });

    const validation = validateUploadSubmission({
      file: primaryFile,
      metadata,
      dogProfile,
      consentAccepted,
      videoTechnical,
      previousUploads,
      angleClips,
    });

    if (validation.errors.length > 0) {
      removeUploadedFiles(extractAllFiles(req.files || {}));

      await recordAudit({
        req,
        actor: req.user,
        action: "upload.validation_failed",
        entityType: "Upload",
        entityId: "",
        details: {
          deletedTempFiles: true,
          captureMode: metadata.captureMode,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });

      return res.status(400).json({
        message: validation.errors[0],
        errors: validation.errors,
        warnings: validation.warnings,
        metadataCompleteness: validation.metadataCompleteness,
        submissionQuality: validation.submissionQuality,
        videoTechnical: validation.videoTechnical,
        capturedAngles: validation.capturedAngles,
        missingAngles: validation.missingAngles,
      });
    }

    let consent = await Consent.findOne({
      owner: req.user._id,
      dogProfile: dogProfile._id,
      status: "active",
      version: String(consentVersion || CURRENT_CONSENT_VERSION).trim(),
    }).sort({ createdAt: -1 });

    if (!consent) {
      await Consent.updateMany(
        { owner: req.user._id, dogProfile: dogProfile._id, status: "active" },
        { $set: { status: "superseded" } },
      );

      consent = await Consent.create({
        owner: req.user._id,
        dogProfile: dogProfile._id,
        accepted: true,
        version: String(consentVersion || CURRENT_CONSENT_VERSION).trim(),
        acceptedAt: new Date(),
        consentText: String(consentText || DEFAULT_CONSENT_TEXT).trim(),
        researchAllowed: String(researchAllowed) === "true",
        dashboardAllowed: true,
        reportAllowed: true,
        status: "active",
      });
    }

    const analysis = analyzeSubmission({
      dogProfile,
      metadata,
      videoTechnical: validation.videoTechnical,
      previousUploads,
      reviewStatus: validation.requiresManualReview
        ? "under-review"
        : "pending",
      validation,
    });
    const { storedAngleClips: uploadedAngleClips, primaryStoredFile } =
      await uploadValidatedFilesToCloudinary({
        singleFile: primaryFile,
        angleClips,
        isMultiAngle,
        dogProfile,
        ownerId: req.user._id,
      });

    const createdCloudinaryKeys = [
      primaryStoredFile?.storageKey,
      ...uploadedAngleClips.map((clip) => clip.storageKey),
    ].filter(Boolean);

    let upload;

    try {
      const storedAngleClips = buildStoredAngleClipDocs(uploadedAngleClips);
      const primaryAngleDoc = choosePrimaryAngleDoc(storedAngleClips);
      const totalFileSize = isMultiAngle
        ? storedAngleClips.reduce(
            (sum, item) => sum + safeNumber(item.fileSize, 0),
            0,
          )
        : primaryFile.size;

      upload = await Upload.create({
        owner: req.user._id,
        dogProfile: dogProfile._id,
        consent: consent._id,
        storageProvider: "cloudinary",
        storageKey: primaryStoredFile.storageKey,
        storagePath: primaryStoredFile.storagePath,
        cloudinaryVersion: primaryStoredFile.cloudinaryVersion || null,
        cloudinaryFormat: primaryStoredFile.cloudinaryFormat || "",
        originalFileName: buildPrimaryFileName({
          singleFile: primaryFile,
          isMultiAngle,
          dogProfile,
        }),
        mimeType: primaryFile.mimetype,
        fileSize: totalFileSize,
        angleClips: storedAngleClips,
        metadata,
        videoTechnical: validation.videoTechnical,
        validation: {
          breedMatch: null,
          requiresManualReview: validation.requiresManualReview,
          metadataCompleteness: validation.metadataCompleteness,
          submissionQuality: validation.submissionQuality,
          validationWarnings: validation.warnings,
          validationErrors: validation.errors,
          profileCompleteness: dogProfile.profileCompleteness || 0,
          capturedAngles: validation.capturedAngles,
          missingAngles: validation.missingAngles,
        },
        metrics: buildMetricsPayload(uploadStartedAt, processingStartedAt),
        reviewStatus: validation.requiresManualReview
          ? "under-review"
          : "pending",
        ...analysis,
      });

      if (isMultiAngle && primaryAngleDoc) {
        upload.storageKey = primaryAngleDoc.storageKey;
        upload.storagePath = primaryAngleDoc.storagePath;
        upload.cloudinaryVersion = primaryAngleDoc.cloudinaryVersion || null;
        upload.cloudinaryFormat = primaryAngleDoc.cloudinaryFormat || "";
        upload.mimeType = primaryAngleDoc.mimeType;
        await upload.save();
      }
    } catch (dbError) {
      await destroyVideoAssets(createdCloudinaryKeys);
      throw dbError;
    }

    const engagementAward = await applyUploadEngagement({
      user: req.user,
      upload,
      profileCompleteness: dogProfile.profileCompleteness || 0,
    });

    upload.engagementAward = {
      pointsEarned: engagementAward.pointsEarned,
      streakAfterUpload: engagementAward.streakAfterUpload,
      badgesUnlocked: engagementAward.badgesUnlocked,
      reasons: engagementAward.rewards,
    };
    await upload.save();

    await recordAudit({
      req,
      actor: req.user,
      action: "upload.created",
      entityType: "Upload",
      entityId: upload._id,
      details: {
        storageProvider: upload.storageProvider,
        captureMode: metadata.captureMode,
        capturedAngles: validation.capturedAngles,
        fileSize: upload.fileSize,
        metadataCompleteness: upload.validation.metadataCompleteness,
        submissionQuality: upload.validation.submissionQuality,
        technicalScore: upload.videoTechnical.technicalScore,
        uploadDurationSeconds: upload.metrics.uploadDurationSeconds,
        processingTimeMs: upload.metrics.processingTimeMs,
        pointsEarned: engagementAward.pointsEarned,
        badgesUnlocked: engagementAward.badgesUnlocked,
      },
    });

    const populatedUpload = await Upload.findById(upload._id)
      .populate(
        "dogProfile",
        "name breed age dateOfBirth weight coatType sex existingConditions profileCompleteness isReadyForUpload isPrimary",
      )
      .populate("consent");

    res.status(201).json({
      message: isMultiAngle
        ? "Guided multi-angle submission uploaded, validated, analyzed, and rewarded successfully."
        : "Video uploaded, validated, analyzed, and rewarded successfully.",
      upload: populatedUpload,
      validation: {
        metadataCompleteness: validation.metadataCompleteness,
        submissionQuality: validation.submissionQuality,
        warnings: validation.warnings,
        videoTechnical: validation.videoTechnical,
        capturedAngles: validation.capturedAngles,
        missingAngles: validation.missingAngles,
      },
      engagement: engagementAward,
      metrics: upload.metrics,
    });
  } catch (error) {
    removeUploadedFiles(extractAllFiles(req.files || {}));
    next(error);
  }
});

router.get("/mine", authMiddleware, async (req, res, next) => {
  try {
    const uploads = await Upload.find({ owner: req.user._id })
      .populate(
        "dogProfile",
        "name breed age dateOfBirth weight coatType sex existingConditions profileCompleteness isReadyForUpload isPrimary",
      )
      .populate("consent")
      .sort({ createdAt: -1 });

    res.json({ uploads });
  } catch (error) {
    next(error);
  }
});

router.get("/file/:id/:angle?", authMiddleware, async (req, res, next) => {
  try {
    const upload = await Upload.findById(req.params.id);

    if (!upload) {
      return res.status(404).json({ message: "Upload not found." });
    }

    const isOwner = String(upload.owner) === String(req.user._id);
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorised to access this video." });
    }

    const requestedAngle = req.params.angle
      ? String(req.params.angle).trim().toLowerCase()
      : "";
    const fileEntry = getRequestedFileEntry(upload, requestedAngle);

    if (!fileEntry?.storageKey) {
      return res
        .status(404)
        .json({ message: "Requested video angle not found." });
    }

    const url = buildSignedVideoUrl({
      publicId: fileEntry.storageKey,
      version: fileEntry.cloudinaryVersion,
      format: fileEntry.cloudinaryFormat,
    });

    return res.json({
      url,
      mimeType: fileEntry.mimeType || "video/mp4",
      fileName: fileEntry.originalFileName || "video.mp4",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
