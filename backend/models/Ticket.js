const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String, required: true },
  username: { type: String, required: true },
  subject: { type: String, required: true },
  issue: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  status: { type: String, enum: ['Open', 'Resolved', 'Closed'], default: 'Open' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ticket', ticketSchema);
