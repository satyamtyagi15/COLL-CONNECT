const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const { cloudinary } = require('../config/cloudinary');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
};

router.get('/users/search', authMiddleware, async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json([]);
  
  const users = await User.find({ username: new RegExp(q, 'i') });
  const matches = users
    .filter(u => u.username !== req.user.username)
    .map(u => ({
      username: u.username,
      profilePic: u.profilePic,
      gender: u.gender,
      socials: u.socials,
      role: u.role,
      hasSentRequest: u.friendRequests.some(fr => fr.username === req.user.username)
    }));
  res.json(matches);
});

router.post('/friend-request', authMiddleware, async (req, res) => {
  const targetUser = await User.findOne({ username: new RegExp('^' + req.body.targetUsername + '$', 'i') });
  if (!targetUser) return res.status(404).json({ error: 'Target user not found' });
  if (targetUser.role === 'superadmin') return res.status(403).json({ error: 'Cannot send friend requests to superadmin' });
  
  if (targetUser.friends.includes(req.user.username)) return res.status(400).json({ error: 'Already friends' });
  if (targetUser.friendRequests.some(fr => fr.username === req.user.username)) return res.status(400).json({ error: 'Request already sent' });
  
  targetUser.friendRequests.push({ username: req.user.username, timestamp: Date.now() });
  await targetUser.save();

  if (req.io) {
    req.io.emit('profile-updated', { username: req.user.username });
    req.io.emit('profile-updated', { username: targetUser.username });
    if (req.io.activeUsers) {
      const targetSocketId = req.io.activeUsers.get(req.body.targetUsername);
      if (targetSocketId) {
        req.io.to(targetSocketId).emit('friend-request-received', req.user.username);
      }
    }
  }
  
  res.json({ success: true });
});

router.post('/friend-accept', authMiddleware, async (req, res) => {
  const me = await User.findOne({ username: req.user.username });
  const targetUser = await User.findOne({ username: new RegExp('^' + req.body.targetUsername + '$', 'i') });
  if (!me || !targetUser) return res.status(404).json({ error: 'User not found' });

  me.friendRequests = me.friendRequests.filter(fr => fr.username !== req.body.targetUsername);
  if (!me.friends.includes(targetUser.username)) me.friends.push(targetUser.username);
  if (!targetUser.friends.includes(me.username)) targetUser.friends.push(me.username);
  
  await me.save();
  await targetUser.save();

  if (req.io) {
    req.io.emit('profile-updated', { username: req.user.username });
    req.io.emit('profile-updated', { username: targetUser.username });
    if (req.io.activeUsers) {
      const targetSocketId = req.io.activeUsers.get(req.body.targetUsername);
      if (targetSocketId) {
        req.io.to(targetSocketId).emit('friend-request-accepted', req.user.username);
      }
    }
  }

  res.json({ success: true });
});

router.post('/friend-decline', authMiddleware, async (req, res) => {
  const me = await User.findOne({ username: req.user.username });
  if (!me) return res.status(404).json({ error: 'User not found' });

  me.friendRequests = me.friendRequests.filter(fr => fr.username !== req.body.targetUsername);
  await me.save();

  if (req.io) {
    req.io.emit('profile-updated', { username: req.user.username });
    req.io.emit('profile-updated', { username: req.body.targetUsername });
    if (req.io.activeUsers) {
      const targetSocketId = req.io.activeUsers.get(req.body.targetUsername);
      if (targetSocketId) {
        req.io.to(targetSocketId).emit('friend-request-declined', req.user.username);
      }
    }
  }

  res.json({ success: true });
});

router.post('/unfriend', authMiddleware, async (req, res) => {
  const me = await User.findOne({ username: req.user.username });
  const targetUser = await User.findOne({ username: new RegExp('^' + req.body.targetUsername + '$', 'i') });
  if (!me || !targetUser) return res.status(404).json({ error: 'User not found' });
  if (targetUser.role === 'superadmin' || me.role === 'superadmin') {
    return res.status(403).json({ error: 'Superadmins cannot be unfriended' });
  }
  
  me.friends = me.friends.filter(f => f !== targetUser.username);
  targetUser.friends = targetUser.friends.filter(f => f !== me.username);
  
  const isMeAdmin = me.role === 'admin' || me.role === 'superadmin';
  const isTargetAdmin = targetUser.role === 'admin' || targetUser.role === 'superadmin';

  // Only delete messages if neither is an admin/superadmin
  if (!isMeAdmin && !isTargetAdmin) {
    const orCondition = [
      { sender: me.username, receiver: targetUser.username },
      { sender: targetUser.username, receiver: me.username }
    ];

    // Find messages with Cloudinary files to delete them
    const messagesWithMedia = await Message.find({
      $or: orCondition,
      fileUrl: { $regex: 'cloudinary.com' }
    });

    for (const msg of messagesWithMedia) {
      try {
        const parts = msg.fileUrl.split('/');
        const filename = parts.pop().split('.')[0];
        const folder = parts.pop();
        const publicId = `${folder}/${filename}`;
        const resourceType = msg.type === 'video' || msg.type === 'audio' ? 'video' : 'image';
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      } catch (err) {
        console.error('Error deleting media from cloudinary:', err);
      }
    }

    await Message.deleteMany({ $or: orCondition });
  }
  
  await me.save();
  await targetUser.save();

  if (req.io) {
    req.io.emit('profile-updated', { username: me.username });
    req.io.emit('profile-updated', { username: targetUser.username });
    if (req.io.activeUsers) {
      const meSocket = req.io.activeUsers.get(me.username);
      const targetSocket = req.io.activeUsers.get(targetUser.username);
      if (meSocket) req.io.to(meSocket).emit('friend-removed', { username: targetUser.username });
      if (targetSocket) req.io.to(targetSocket).emit('friend-removed', { username: me.username });
    }
  }

  res.json({ success: true });
});

module.exports = router;
