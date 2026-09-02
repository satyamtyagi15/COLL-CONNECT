const mongoose = require('mongoose');

const whisperSchema = new mongoose.Schema({
  author: { type: String, required: true },
  targetUser: { type: String, required: true },
  content: { type: String, required: true },
  isAnonymous: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Whisper', whisperSchema);
