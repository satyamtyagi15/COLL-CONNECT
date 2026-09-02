const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const deleteImageFromCloudinary = async (imageUrl) => {
  if (!imageUrl || !imageUrl.includes('cloudinary.com')) return;
  try {
    const parts = imageUrl.split('/');
    const filenameWithExt = parts.pop();
    const folder = parts.pop();
    const filename = filenameWithExt.split('.')[0];
    const publicId = `${folder}/${filename}`;
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Failed to delete image from Cloudinary:', err);
  }
};

module.exports = { cloudinary, upload, deleteImageFromCloudinary };
