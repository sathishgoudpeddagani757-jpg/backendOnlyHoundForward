const crypto = require("crypto");
const streamifier = require("streamifier");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const ensureCloudinaryConfigured = () => {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error(
      "Cloudinary environment variables are missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }
};

const buildPublicId = (originalName = "") => {
  const baseName = String(originalName || "video")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `${Date.now()}-${crypto.randomUUID()}${baseName ? `-${baseName}` : ""}`;
};

const uploadVideoBuffer = (file, options = {}) => {
  ensureCloudinaryConfigured();

  const folder =
    options.folder ||
    process.env.CLOUDINARY_UPLOAD_FOLDER ||
    "hound-forward/uploads";
  const publicId = options.publicId || buildPublicId(file?.originalname);
  const tags = Array.isArray(options.tags) ? options.tags.filter(Boolean) : [];
  const context = options.context || {};

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        type: "authenticated",
        folder,
        public_id: publicId,
        overwrite: false,
        use_filename: false,
        unique_filename: false,
        tags,
        context,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          version: result.version,
          bytes: result.bytes,
          secureUrl: result.secure_url,
        });
      },
    );

    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

const destroyVideoAsset = async (publicId) => {
  if (!publicId) return false;
  ensureCloudinaryConfigured();

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "video",
    type: "authenticated",
    invalidate: true,
  });

  return result?.result === "ok" || result?.result === "not found";
};

const destroyVideoAssets = async (publicIds = []) => {
  const uniquePublicIds = [...new Set(publicIds.filter(Boolean))];
  await Promise.all(
    uniquePublicIds.map(async (publicId) => {
      try {
        await destroyVideoAsset(publicId);
      } catch (error) {
        console.error(
          `Failed to delete Cloudinary asset ${publicId}:`,
          error.message,
        );
      }
    }),
  );
};

const buildSignedVideoUrl = ({ publicId, version, format }) => {
  ensureCloudinaryConfigured();

  return cloudinary.url(publicId, {
    resource_type: "video",
    type: "authenticated",
    sign_url: true,
    secure: true,
    version,
    format,
  });
};

module.exports = {
  uploadVideoBuffer,
  destroyVideoAssets,
  buildSignedVideoUrl,
};
