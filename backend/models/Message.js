const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true }, // username
  receiver: { type: String, required: true }, // username
  text: { type: String, default: '' },
  type: { type: String, default: 'text' }, // text, image, video, audio
  fileUrl: { type: String, default: '' },
  read: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  isTimeCapsule: { type: Boolean, default: false },
  deliverAt: { type: Date, default: null }
});

module.exports = mongoose.model('Message', messageSchema);
