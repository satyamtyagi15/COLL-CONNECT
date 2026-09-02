const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
};

router.get('/messages/:friend', authMiddleware, async (req, res) => {
  const me = req.user.username;
  const friend = req.params.friend;
  
  const history = await Message.find({
    $or: [
      { sender: me, receiver: friend },
      { sender: friend, receiver: me }
    ]
  }).sort({ timestamp: 1 });
  
  res.json(history.map(m => ({
    id: m._id.toString(),
    sender: m.sender,
    receiver: m.receiver,
    text: m.text,
    type: m.type,
    fileUrl: m.fileUrl,
    timestamp: m.timestamp,
    isTimeCapsule: m.isTimeCapsule,
    deliverAt: m.deliverAt
  })));
});

router.put('/messages/:friend/read', authMiddleware, async (req, res) => {
  const me = req.user.username;
  const friend = req.params.friend;
  
  await Message.updateMany(
    { sender: friend, receiver: me, read: false },
    { $set: { read: true } }
  );
  
  res.json({ success: true });
});

module.exports = router;
