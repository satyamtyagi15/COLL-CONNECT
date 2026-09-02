const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  email: { type: String, required: true },
  username: { type: String, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  status: { type: String, default: 'open' },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date }
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
