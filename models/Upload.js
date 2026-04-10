const mongoose = require("mongoose");

const technicalSchema = new mongoose.Schema(
  {
    durationSeconds: {
      type: Number,
      default: 0,
    },
    width: {
      type: Number,
      default: 0,
    },
    height: {
      type: Number,
      default: 0,
    },
    orientation: {
      type: String,
      enum: ["landscape", "portrait", "square", "unknown", "mixed"],
      default: "unknown",
    },
    aspectRatio: {
      type: Number,
      default: 0,
    },
    estimatedBitrateKbps: {
      type: Number,
      default: 0,
    },
    technicalScore: {
      type: Number,
      default: 0,
    },
    technicalWarnings: {
      type: [String],
      default: [],
    },
  },
  { _id: false },
);

const angleClipSchema = new mongoose.Schema(
  {
    angle: {
      type: String,
      enum: ["front", "left", "right", "rear"],
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    cloudinaryVersion: {
      type: Number,
      default: null,
    },
    cloudinaryFormat: {
      type: String,
      default: "",
    },
    originalFileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    videoTechnical: {
      type: technicalSchema,
      default: () => ({}),
    },
  },
  { _id: false },
);

const uploadSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dogProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DogProfile",
      required: true,
      index: true,
    },
    consent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consent",
      required: true,
    },

    storageProvider: {
      type: String,
      enum: ["local-private", "cloudinary"],
      default: "cloudinary",
    },
    storageKey: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    cloudinaryVersion: {
      type: Number,
      default: null,
    },
    cloudinaryFormat: {
      type: String,
      default: "",
    },
    originalFileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },

    angleClips: {
      type: [angleClipSchema],
      default: [],
    },

    metadata: {
      recordingAngle: {
        type: String,
        required: true,
      },
      movementType: {
        type: String,
        required: true,
      },
      surfaceType: {
        type: String,
        required: true,
      },
      lightingConditions: {
        type: String,
        required: true,
      },
      notes: {
        type: String,
        default: "",
      },
      captureMode: {
        type: String,
        enum: ["single-upload", "guided-multi-angle"],
        default: "single-upload",
      },
      requiredAnglesCaptured: {
        type: Boolean,
        default: false,
      },
      angleSequence: {
        type: [String],
        default: [],
      },
    },

    videoTechnical: {
      type: technicalSchema,
      default: () => ({}),
    },

    validation: {
      breedMatch: {
        type: Boolean,
        default: null,
      },
      requiresManualReview: {
        type: Boolean,
        default: false,
      },
      metadataCompleteness: {
        type: Number,
        default: 0,
      },
      submissionQuality: {
        type: String,
        enum: ["High", "Acceptable", "Needs Improvement"],
        default: "Acceptable",
      },
      validationWarnings: {
        type: [String],
        default: [],
      },
      validationErrors: {
        type: [String],
        default: [],
      },
      profileCompleteness: {
        type: Number,
        default: 0,
      },
      capturedAngles: {
        type: [String],
        default: [],
      },
      missingAngles: {
        type: [String],
        default: [],
      },
    },

    metrics: {
      uploadStartedAt: {
        type: Date,
        default: null,
      },
      uploadCompletedAt: {
        type: Date,
        default: null,
      },
      uploadDurationSeconds: {
        type: Number,
        default: 0,
      },
      processingTimeMs: {
        type: Number,
        default: 0,
      },
      reportGeneratedAt: {
        type: Date,
        default: null,
      },
      reportGenerationSuccess: {
        type: Boolean,
        default: false,
      },
    },

    reviewStatus: {
      type: String,
      enum: ["pending", "under-review", "approved", "rejected"],
      default: "pending",
    },
    adminFeedback: {
      type: String,
      default: "",
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    healthScore: {
      type: Number,
      default: 0,
    },
    confidenceScore: {
      type: Number,
      default: 0,
    },
    qualityScore: {
      type: Number,
      default: 0,
    },
    trend: {
      type: String,
      default: "Baseline",
    },
    overallStatus: {
      type: String,
      default: "Monitor",
    },
    riskLevel: {
      type: String,
      enum: ["Low", "Moderate", "Elevated"],
      default: "Moderate",
    },
    recommendations: {
      type: [String],
      default: [],
    },
    analysisNotes: {
      type: [String],
      default: [],
    },
    comparison: {
      previousHealthScore: { type: Number, default: null },
      scoreChange: { type: Number, default: 0 },
      previousConfidenceScore: { type: Number, default: null },
      confidenceChange: { type: Number, default: 0 },
      baselineAverageScore: { type: Number, default: null },
      repeatedQualityIssues: { type: [String], default: [] },
      longitudinalSummary: { type: String, default: "" },
    },
    engagementAward: {
      pointsEarned: { type: Number, default: 0 },
      streakAfterUpload: { type: Number, default: 0 },
      badgesUnlocked: { type: [String], default: [] },
      reasons: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

uploadSchema.index({ owner: 1, dogProfile: 1, createdAt: -1 });
uploadSchema.index({ reviewStatus: 1, createdAt: -1 });

module.exports = mongoose.model("Upload", uploadSchema);
