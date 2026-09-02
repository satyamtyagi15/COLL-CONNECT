const mongoose = require('mongoose');

const deletionRequestSchema = new mongoose.Schema({
  email: { type: String, required: true },
  username: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' } // pending, processed, rejected
});

module.exports = mongoose.model('DeletionRequest', deletionRequestSchema);
