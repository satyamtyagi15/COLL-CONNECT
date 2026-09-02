const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Report = require('../models/Report');
const DeletionRequest = require('../models/DeletionRequest');
const { cloudinary } = require('../config/cloudinary');
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

router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  if (!user) return res.status(404).json({ error: 'Not found' });

  if (user.blockedUntil) {
    if (user.blockedUntil === 'permanent') return res.status(403).json({ error: 'Permanently blocked' });
    if (new Date(user.blockedUntil) > new Date()) return res.status(403).json({ error: `Blocked until ${new Date(user.blockedUntil).toLocaleString()}` });
    user.blockedUntil = undefined;
    await user.save();
  }

  const actualFriends = user.friends || [];
  const interactedUsers = new Set();
  const msgs = await Message.find({ $or: [{ sender: user.username }, { receiver: user.username }] });
  const unreadCounts = {};
  msgs.forEach(m => {
    if (m.sender === user.username) interactedUsers.add(m.receiver);
    else {
      interactedUsers.add(m.sender);
      if (m.receiver === user.username && m.read === false) {
        unreadCounts[m.sender] = (unreadCounts[m.sender] || 0) + 1;
      }
    }
  });
  
  const friendsAndInteracted = new Set([...actualFriends, ...interactedUsers]);
  const friendsList = [];
  const isMeAdmin = user.role === 'admin' || user.role === 'superadmin';

  if (user.role === 'superadmin') {
    const allUsers = await User.find({ username: { $ne: user.username } });
    for (let u of allUsers) {

      friendsList.push({
        username: u.username,
        email: u.email,
        profilePic: u.profilePic,
        bannerImage: u.bannerImage,
        gender: u.gender,
        socials: u.socials,
        role: u.role,
        isFriend: true,
        warningHistory: u.warningHistory,
        blockedUntil: u.blockedUntil
      });
    }
  } else {
    const interactionUsernames = Array.from(friendsAndInteracted).filter(uname => uname !== user.username);
    const fUsers = await User.find({ username: { $in: interactionUsernames } });
    
    for (let fUser of fUsers) {
      if (!isMeAdmin && !actualFriends.includes(fUser.username) && fUser.role !== 'admin' && fUser.role !== 'superadmin') continue;
      friendsList.push({
        username: fUser.username,
        email: fUser.email,
        profilePic: fUser.profilePic,
        bannerImage: fUser.bannerImage,
        gender: fUser.gender,
        socials: fUser.socials,
        role: fUser.role,
        isFriend: actualFriends.includes(fUser.username),
        warningHistory: fUser.warningHistory,
        blockedUntil: fUser.blockedUntil
      });
    }
  }

  const superadminUser = await User.findOne({ role: 'superadmin' });
  if (superadminUser && user.role !== 'superadmin' && !friendsList.find(f => f.username === superadminUser.username)) {
    friendsList.push({
      username: superadminUser.username,
      profilePic: superadminUser.profilePic,
      bannerImage: superadminUser.bannerImage,
      gender: superadminUser.gender,
      socials: superadminUser.socials,
      role: 'superadmin',
      isFriend: true
    });
  }

  const friendRequests = [];
  for (let r of (user.friendRequests || [])) {
    const reqUser = await User.findOne({ username: r.username });
    if (reqUser) friendRequests.push({
      username: reqUser.username,
      profilePic: reqUser.profilePic,
      gender: reqUser.gender,
      socials: reqUser.socials,
      role: reqUser.role
    });
  }

  // Clean up expired profile visitors (older than 24 hours)
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  let visitorsModified = false;
  
  if (user.profileVisitors && user.profileVisitors.length > 0) {
    const originalLength = user.profileVisitors.length;
    user.profileVisitors = user.profileVisitors.filter(v => (now - new Date(v.timestamp).getTime()) < oneDayMs);
    if (user.profileVisitors.length !== originalLength) {
      visitorsModified = true;
    }
  }
  if (visitorsModified) {
    await user.save();
  }

  // Populate visitors details
  const populatedVisitors = [];
  for (let v of (user.profileVisitors || [])) {
    const vUser = await User.findOne({ username: v.username });
    if (vUser) {
      populatedVisitors.push({
        username: vUser.username,
        profilePic: vUser.profilePic,
        role: vUser.role,
        timestamp: v.timestamp
      });
    }
  }
  populatedVisitors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  res.json({
    username: user.username,
    email: user.email,
    profilePic: user.profilePic,
    bannerImage: user.bannerImage,
    gender: user.gender,
    socials: user.socials,
    spotifyUrl: user.spotifyUrl,
    friends: friendsList,
    friendRequests,
    profileVisitors: populatedVisitors,
    role: user.role,
    isPrivate: user.isPrivate || false,
    deletionRequested: user.deletionRequested || false,
    unreadCounts
  });
});

router.put('/privacy', authMiddleware, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  user.isPrivate = req.body.isPrivate;
  await user.save();
  
  res.json({ success: true, isPrivate: user.isPrivate });
});

router.get('/users/:username', authMiddleware, async (req, res) => {
  const targetUser = await User.findOne({ username: new RegExp('^' + req.params.username + '$', 'i') });
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const visitingUser = await User.findOne({ username: req.user.username });
  const visitorRole = visitingUser ? visitingUser.role : 'user';

  // Record Visit (If visitor is not superadmin)
  if (visitorRole !== 'superadmin' && req.user.username !== targetUser.username) {
    if (!targetUser.profileVisitors) targetUser.profileVisitors = [];
    const visitorIndex = targetUser.profileVisitors.findIndex(v => v.username === req.user.username);
    if (visitorIndex !== -1) {
      targetUser.profileVisitors[visitorIndex].timestamp = Date.now();
    } else {
      targetUser.profileVisitors.push({ username: req.user.username, timestamp: Date.now() });
    }
    await targetUser.save();
  } else if (visitorRole === 'superadmin') {
    // If a superadmin visits, let's proactively remove them from the target's visitors array
    // just in case they were recorded previously due to the JWT bug.
    if (targetUser.profileVisitors) {
      const originalLength = targetUser.profileVisitors.length;
      targetUser.profileVisitors = targetUser.profileVisitors.filter(v => v.username !== req.user.username);
      if (targetUser.profileVisitors.length !== originalLength) {
        await targetUser.save();
      }
    }
  }

  const isFriend = (targetUser.friends || []).includes(req.user.username);
  const hasSentRequest = (targetUser.friendRequests || []).some(fr => fr.username === req.user.username);
  const hasReceivedRequest = (visitingUser?.friendRequests || []).some(fr => fr.username === targetUser.username);
  
  const friendsList = [];
  for (let fName of (targetUser.friends || [])) {
    const fUser = await User.findOne({ username: fName });
    if (fUser) {
      friendsList.push({
        username: fUser.username,
        profilePic: fUser.profilePic,
        role: fUser.role
      });
    }
  }

  const isViewerSuperadmin = visitingUser && visitingUser.role === 'superadmin';
  const isPrivate = targetUser.isPrivate || false;

  let returnSocials = targetUser.socials;
  let returnFriends = friendsList;

  if (isPrivate && !isFriend && !isViewerSuperadmin && req.user.username !== targetUser.username) {
    returnSocials = null;
    returnFriends = null;
  }

  res.json({
    username: targetUser.username,
    profilePic: targetUser.profilePic,
    bannerImage: targetUser.bannerImage,
    gender: targetUser.gender,
    socials: returnSocials,
    role: targetUser.role,
    isFriend: isFriend,
    hasSentRequest,
    hasReceivedRequest,
    friends: returnFriends,
    isPrivate: isPrivate,
    spotifyUrl: targetUser.spotifyUrl
  });
});

const deleteCloudinaryImage = async (imageUrl) => {
  if (!imageUrl || !imageUrl.includes('cloudinary.com')) return;
  try {
    const parts = imageUrl.split('/');
    const filename = parts.pop().split('.')[0];
    const folder = parts.pop();
    const publicId = `${folder}/${filename}`;
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Failed to delete old image from Cloudinary:', err);
  }
};

router.post('/profile-pic', authMiddleware, async (req, res) => {
  const oldUser = await User.findOne({ username: req.user.username });
  if (!oldUser) return res.status(404).json({ error: 'Not found' });
  
  if (oldUser.profilePic && req.body.profilePic) {
    await deleteCloudinaryImage(oldUser.profilePic);
  }

  oldUser.profilePic = req.body.profilePic || '';
  oldUser.save();

  if (req.io) {
    req.io.emit('admin-update');
    req.io.emit('profile-updated', { username: oldUser.username, profilePic: oldUser.profilePic, bannerImage: oldUser.bannerImage });
  }
  res.json({ success: true, profilePic: oldUser.profilePic });
});

router.delete('/profile-pic', authMiddleware, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  if (!user) return res.status(404).json({ error: 'Not found' });

  if (user.profilePic) {
    await deleteCloudinaryImage(user.profilePic);
  }
  user.profilePic = '';
  await user.save();

  if (req.io) {
    req.io.emit('admin-update');
    req.io.emit('profile-updated', { username: user.username, profilePic: user.profilePic, bannerImage: user.bannerImage });
  }
  res.json({ success: true, profilePic: '' });
});

router.post('/profile-banner', authMiddleware, async (req, res) => {
  const oldUser = await User.findOne({ username: req.user.username });
  if (!oldUser) return res.status(404).json({ error: 'Not found' });
  
  if (oldUser.bannerImage && req.body.bannerImage) {
    await deleteCloudinaryImage(oldUser.bannerImage);
  }

  oldUser.bannerImage = req.body.bannerImage || '';
  await oldUser.save();

  if (req.io) {
    req.io.emit('admin-update');
    req.io.emit('profile-updated', { username: oldUser.username, profilePic: oldUser.profilePic, bannerImage: oldUser.bannerImage });
  }
  res.json({ success: true, bannerImage: oldUser.bannerImage });
});

router.delete('/profile-banner', authMiddleware, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  if (!user) return res.status(404).json({ error: 'Not found' });

  if (user.bannerImage) {
    await deleteCloudinaryImage(user.bannerImage);
  }
  user.bannerImage = '';
  await user.save();

  if (req.io) {
    req.io.emit('admin-update');
    req.io.emit('profile-updated', { username: user.username, profilePic: user.profilePic, bannerImage: user.bannerImage });
  }
  res.json({ success: true, bannerImage: '' });
});

router.post('/profile/socials', authMiddleware, async (req, res) => {
  const user = await User.findOneAndUpdate({ username: req.user.username }, { socials: req.body.socials }, { new: true });
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (req.io) {
    req.io.emit('admin-update');
    req.io.emit('profile-updated', { 
      username: user.username, 
      profilePic: user.profilePic, 
      bannerImage: user.bannerImage,
      socials: user.socials
    });
  }
  res.json({ success: true, socials: user.socials });
});

router.post('/profile/spotify', authMiddleware, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.spotifyUrl = req.body.spotifyUrl || '';
  await user.save();
  res.json({ success: true, spotifyUrl: user.spotifyUrl });
});

router.post('/profile/gender', authMiddleware, async (req, res) => {
  const user = await User.findOneAndUpdate({ username: req.user.username }, { gender: req.body.gender || 'Not Specified' }, { new: true });
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (req.io) req.io.emit('admin-update');
  res.json({ success: true, gender: user.gender });
});

router.post('/profile/change-username', authMiddleware, async (req, res) => {
  const oldUsername = req.user.username;
  let { newUsername } = req.body;
  if (!newUsername) return res.status(400).json({ error: 'New username required' });
  newUsername = newUsername.trim().toLowerCase();
  if (newUsername.length < 3 || newUsername.length > 20) return res.status(400).json({ error: 'Username must be 3-20 chars' });
  if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) return res.status(400).json({ error: 'Invalid characters' });

  if (await User.findOne({ username: new RegExp('^' + newUsername + '$', 'i') })) return res.status(400).json({ error: 'Username taken' });

  const user = await User.findOne({ username: oldUsername });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  if (user.lastUsernameChangeDate && Date.now() - user.lastUsernameChangeDate < oneYearMs) {
    return res.status(400).json({ error: 'You can only change username once a year.' });
  }

  user.username = newUsername;
  user.lastUsernameChangeDate = Date.now();
  await user.save();

  // Update friends lists and friend requests
  await User.updateMany({ friends: oldUsername }, { $set: { "friends.$": newUsername } });
  await User.updateMany({ "friendRequests.username": oldUsername }, { $set: { "friendRequests.$.username": newUsername } });
  await User.updateMany({ "warningHistory.byAdmin": oldUsername }, { $set: { "warningHistory.$.byAdmin": newUsername } });
  
  await Message.updateMany({ sender: oldUsername }, { sender: newUsername });
  await Message.updateMany({ receiver: oldUsername }, { receiver: newUsername });

  const token = jwt.sign({ username: newUsername, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  if (req.io) req.io.emit('admin-update');
  
  res.json({ success: true, token, newUsername });
});

router.post('/request-deletion', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'superadmin') return res.status(403).json({ error: 'Superadmin cannot be deleted' });

    user.deletionRequested = true;
    await user.save();

    if (req.io) {
      req.io.emit('new-deletion-request');
      req.io.emit('admin-update');
    }

    // Send response FIRST so UI updates instantly
    res.json({ success: true, message: 'Deletion request submitted.' });

    // Fire email in background (don't block response)
    const mailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
        <h2 style="color: #f59e0b; text-align: center;">Account Deletion Request</h2>
        <p style="font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
        <p style="font-size: 16px;">We have received your request to permanently delete your Coll-Connect account.</p>
        <p style="font-size: 16px;">An admin will review your request shortly. If approved, all your data, chats, and profile will be permanently removed from our servers.</p>
        <p style="font-size: 16px;">If you changed your mind, please reach out to support immediately.</p>
        <br>
        <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
      </div>
    `;
    sendEmail(user.email, '⚠️ Account Deletion Request Received', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));

  } catch (err) {
    console.error('Error requesting deletion:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/report', authMiddleware, async (req, res) => {
  try {
    const { reportedUser, reason, screenshotData } = req.body;
    if (!reportedUser || !reason) {
      return res.status(400).json({ error: 'Reported user and reason are required' });
    }

    const targetUser = await User.findOne({ username: reportedUser });
    if (targetUser && targetUser.role === 'superadmin') {
      return res.status(403).json({ error: 'Superadmins cannot be reported' });
    }

    let screenshotUrl = '';
    if (screenshotData) {
      const uploadRes = await cloudinary.uploader.upload(screenshotData, { folder: 'reports' });
      screenshotUrl = uploadRes.secure_url;
    }

    const report = new Report({
      reporter: req.user.username,
      reportedUser,
      reason,
      screenshot: screenshotUrl
    });
    
    await report.save();

    if (req.io) {
      req.io.emit('admin-update');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error submitting report:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/badges', authMiddleware, async (req, res) => {
  try {
    const unreadMessages = await Message.countDocuments({ receiver: req.user.username, read: false });
    
    let unreadReports = 0;
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      unreadReports = await Report.countDocuments({ status: 'pending' });
    }

    let unreadDeletionRequests = 0;
    if (req.user.role === 'superadmin') {
      unreadDeletionRequests = await DeletionRequest.countDocuments({ status: 'pending' });
    }

    res.json({
      messages: unreadMessages,
      reports: unreadReports,
      deletionRequests: unreadDeletionRequests
    });
  } catch (err) {
    console.error('Error fetching badges:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
