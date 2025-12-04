const cloudinary = require('cloudinary').v2;

// Configure cloudinary from env; do not hardcode credentials here.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dq7avew9h',
  api_key: process.env.CLOUDINARY_API_KEY || '269445354174876',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'Qvl3ZGMLFCjKTXhbRX59Ot6fvTM',
});

// Accepts either a JSON body with { dataUrl } or a multipart/form-data file in field 'file'.
// Returns { url, raw } on success.
async function uploadToCloudinary(req, res) {
  try {
    // Ensure Cloudinary credentials are present; provide a clear error if missing.
    if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_CLOUD_NAME) {
      const have = {
        CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
        CLOUDINARY_UNSIGNED_UPLOAD_PRESET: !!process.env.CLOUDINARY_UNSIGNED_UPLOAD_PRESET,
      };
      console.error('Cloudinary credentials missing: ', have);

      // If cloud name is present and an unsigned preset is configured, give a helpful hint
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const unsignedPreset = process.env.CLOUDINARY_UNSIGNED_UPLOAD_PRESET;
      const suggestion = cloudName && unsignedPreset
        ? { unsigned_upload_url: `https://api.cloudinary.com/v1_1/${cloudName}/upload`, upload_preset: unsignedPreset }
        : null;

      let message = 'Cloudinary configuration missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the backend environment.';
      if (suggestion) {
        message = 'Cloudinary server credentials missing, but unsigned upload preset is available. You can perform unsigned (client) uploads using the provided URL and preset.';
      }

      return res.status(500).json({ error: message, have, suggestion });
    }
    let payload;

    if (req.body && req.body.dataUrl) {
      payload = req.body.dataUrl; // expected data:<mime>;base64,... string
    } else if (req.file && req.file.buffer) {
      const mime = req.file.mimetype || 'application/octet-stream';
      const b64 = req.file.buffer.toString('base64');
      payload = `data:${mime};base64,${b64}`;
    } else {
      return res.status(400).json({ error: 'No file provided. Send multipart file `file` or JSON { dataUrl }' });
    }

    // Determine resource_type based on MIME (images => image, otherwise raw)
    let resourceType = 'image';
    // If we have a file MIME from multipart, prefer that
    let detectedMime = null;
    if (req.file && req.file.mimetype) detectedMime = req.file.mimetype;
    if (!detectedMime && typeof payload === 'string' && payload.startsWith('data:')) {
      // data:<mime>;base64,...
      const m = payload.match(/^data:([^;]+);base64,/);
      if (m && m[1]) detectedMime = m[1];
    }
    if (detectedMime) {
      if (!detectedMime.startsWith('image/')) resourceType = 'raw';
    }

    const result = await cloudinary.uploader.upload(payload, {
      folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'paiements',
      resource_type: resourceType,
      overwrite: false,
    });

    return res.json({ url: result.secure_url, raw: result });
  } catch (err) {
    console.error('uploadToCloudinary error:', err);
    return res.status(500).json({ error: 'Upload failed', details: err.message || err });
  }
}

module.exports = { uploadToCloudinary };
