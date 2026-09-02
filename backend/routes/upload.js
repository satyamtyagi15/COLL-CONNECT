const express = require('express');
const router = express.Router();
const { upload, cloudinary } = require('../config/cloudinary');

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const uploadStream = cloudinary.uploader.upload_stream(
    { folder: 'omegle-clone-uploads', resource_type: 'auto' },
    (error, result) => {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ url: result.secure_url });
    }
  );

  uploadStream.end(req.file.buffer);
});

router.delete('/delete-image', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL is required' });
  }

  try {
    // Extract public_id from Cloudinary URL
    // Example URL: https://res.cloudinary.com/demo/image/upload/v1234567890/folder/filename.jpg
    const parts = imageUrl.split('/');
    const filename = parts.pop().split('.')[0];
    const folder = parts.pop();
    const publicId = `${folder}/${filename}`;

    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result !== 'ok' && result.result !== 'not found') {
      console.error('Cloudinary deletion failed:', result);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

module.exports = router;
