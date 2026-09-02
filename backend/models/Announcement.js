const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Announcement', announcementSchema);
