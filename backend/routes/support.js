const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const SupportTicket = require('../models/SupportTicket');
const { deleteImageFromCloudinary } = require('../config/cloudinary');
const { sendEmail } = require('../utils/mailer');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
};

const isSuperAdmin = async (req, res, next) => {
  authMiddleware(req, res, async () => {
    const User = require('../models/User');
    const user = await User.findOne({ username: req.user.username });
    if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
};

router.post('/support', authMiddleware, async (req, res) => {
  const { subject, message, imageUrl } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });
  
  const ticket = new SupportTicket({ 
    email: req.user.email, 
    username: req.user.username,
    subject, 
    message,
    imageUrl: imageUrl || ''
  });
  await ticket.save();
  if (req.io) req.io.emit('refresh-support-tickets');
  
  res.json({ success: true, ticket });

  // Fire email in background (don't block response)
  const mailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
      <h2 style="color: #3b82f6; text-align: center;">Support Ticket Submitted</h2>
      <p style="font-size: 16px;">Hello <strong>${req.user.username}</strong>,</p>
      <p style="font-size: 16px;">We have received your support ticket regarding <strong>${subject}</strong>.</p>
      <p style="font-size: 16px;">Our team is reviewing it and will get back to you shortly.</p>
      <br>
      <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Support Team</p>
    </div>
  `;
  sendEmail(req.user.email, '🎫 Support Ticket Received', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));
});

router.get('/support', isSuperAdmin, async (req, res) => {
  const tickets = await SupportTicket.find().sort({ createdAt: -1 });
  res.json(tickets);
});

router.post('/support/:id/resolve', isSuperAdmin, async (req, res) => {
  await SupportTicket.findByIdAndUpdate(req.params.id, { status: 'resolved', resolvedAt: Date.now() });
  if (req.io) req.io.emit('refresh-support-tickets');
  res.json({ success: true });
});

router.delete('/support/:id', isSuperAdmin, async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (ticket && ticket.imageUrl) {
    await deleteImageFromCloudinary(ticket.imageUrl);
  }
  await SupportTicket.findByIdAndDelete(req.params.id);
  if (req.io) req.io.emit('refresh-support-tickets');
  res.json({ success: true });
});

module.exports = router;
