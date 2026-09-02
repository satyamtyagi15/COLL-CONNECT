const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: { type: String, required: true }, // username
  reportedUser: { type: String, required: true }, // username
  reason: { type: String, required: true },
  screenshot: { type: String }, // Cloudinary URL
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' }, // pending, resolved, dismissed
  resolvedBy: { type: String }
});

module.exports = mongoose.model('Report', reportSchema);
