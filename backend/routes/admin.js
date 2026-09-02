const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Report = require('../models/Report');
const DeletionRequest = require('../models/DeletionRequest');
const Analytics = require('../models/Analytics');
const { sendEmail } = require('../utils/mailer');
const { cloudinary } = require('../config/cloudinary');

const deleteCloudinaryImage = async (imageUrl, resourceType = 'image') => {
  if (!imageUrl || !imageUrl.includes('cloudinary.com')) return;
  try {
    const parts = imageUrl.split('/');
    const filename = parts.pop().split('.')[0];
    const folder = parts.pop();
    const publicId = `${folder}/${filename}`;
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('Error deleting image from Cloudinary:', err);
  }
};

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
};

const isAdmin = async (req, res, next) => {
  authMiddleware(req, res, async () => {
    const user = await User.findOne({ username: req.user.username });
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return res.status(403).json({ error: 'Forbidden' });
    next();
  });
};

const isSuperAdmin = async (req, res, next) => {
  authMiddleware(req, res, async () => {
    const user = await User.findOne({ username: req.user.username });
    if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
};

router.get('/admin/deletion-requests', isSuperAdmin, async (req, res) => {
  const users = await User.find({ deletionRequested: true });
  
  // We also need to get their report count/warnings to match the UI requirements
  const requests = users.map(u => ({
    username: u.username,
    email: u.email,
    profilePic: u.profilePic,
    joinedAt: u.joinedAt,
    warningHistory: u.warningHistory || []
  }));
  res.json(requests);
});

router.post('/admin/deletion-requests/:username/accept', isSuperAdmin, async (req, res) => {
  const targetUsername = req.params.username;
  const user = await User.findOne({ username: targetUsername });
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  try {
    const userEmail = user.email;
    await cascadeDeleteUser(targetUsername, req.io);

    // Fire email in background
    const mailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
        <h2 style="color: #ef4444; text-align: center;">Account Deleted</h2>
        <p style="font-size: 16px;">Hello <strong>${targetUsername}</strong>,</p>
        <p style="font-size: 16px;">Your request to delete your Coll-Connect account has been processed. Your account and all associated data have been permanently removed.</p>
        <br>
        <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
      </div>
    `;
    sendEmail(userEmail, 'Account Deletion Confirmed', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));

    res.json({ success: true, message: 'Account permanently deleted' });
  } catch (err) {
    console.error('Error accepting deletion:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/admin/deletion-requests/:username/dismiss', isSuperAdmin, async (req, res) => {
  const targetUsername = req.params.username;
  const user = await User.findOne({ username: targetUsername });
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  user.deletionRequested = false;
  await user.save();
  
  if (req.io) {
    const activeUsers = req.io.activeUsers;
    if (activeUsers) {
      const targetSocketId = activeUsers.get(targetUsername);
      if (targetSocketId) {
        req.io.to(targetSocketId).emit('deletion-request-dismissed');
      }
    }
    req.io.emit('admin-update');
    req.io.emit('deletion-request-resolved');
  }
  
  // Fire email in background
  const mailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
      <h2 style="color: #3b82f6; text-align: center;">Deletion Request Declined</h2>
      <p style="font-size: 16px;">Hello <strong>${targetUsername}</strong>,</p>
      <p style="font-size: 16px;">Your request to delete your Coll-Connect account has been reviewed and declined by an administrator. Your account remains active.</p>
      <br>
      <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
    </div>
  `;
  sendEmail(user.email, 'Account Deletion Request Declined', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));

  res.json({ success: true });
});

router.get('/admin/users', isAdmin, async (req, res) => {
  const reqUser = await User.findOne({ username: req.user.username });
  const isReqSuperadmin = reqUser && reqUser.role === 'superadmin';
  const users = await User.find();
  const reports = await Report.find();
  const mappedReports = reports.map(r => ({
    id: r._id.toString(),
    reporter: r.reporter,
    reportedUser: r.reportedUser,
    reason: r.reason,
    screenshot: r.screenshot,
    time: r.timestamp,
    status: r.status,
    resolvedBy: r.resolvedBy
  }));

  const safeUsers = users.map(u => ({
    username: u.username,
    email: u.email,
    profilePic: u.profilePic,
    bannerImage: u.bannerImage,
    gender: u.gender,
    socials: u.socials,
    joinedAt: u.joinedAt,
    role: u.role,
    reportCount: mappedReports.filter(r => r.reportedUser === u.username && r.status === 'pending').length,
    reports: mappedReports.filter(r => r.reportedUser === u.username && r.status === 'pending'),
    warningHistory: u.warningHistory || [],
    blockedUntil: u.blockedUntil,
    deletionRequested: u.deletionRequested || false,
    password: isReqSuperadmin ? u.password : undefined
  }));
  
  res.json({ users: safeUsers, reports: mappedReports });
});


router.delete('/admin/users/:username/profile-pic', isSuperAdmin, async (req, res) => {
  const targetUser = await User.findOne({ username: req.params.username });
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  
  if (targetUser.profilePic) {
    await deleteCloudinaryImage(targetUser.profilePic);
    targetUser.profilePic = '';
    await targetUser.save();
    if (req.io) {
      req.io.emit('admin-update');
      req.io.emit('profile-updated', { username: targetUser.username, profilePic: '', bannerImage: targetUser.bannerImage });
    }
  }
  res.json({ success: true });
});

router.delete('/admin/users/:username/banner', isSuperAdmin, async (req, res) => {
  const targetUser = await User.findOne({ username: req.params.username });
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  
  if (targetUser.bannerImage) {
    await deleteCloudinaryImage(targetUser.bannerImage);
    targetUser.bannerImage = '';
    await targetUser.save();
    if (req.io) {
      req.io.emit('admin-update');
      req.io.emit('profile-updated', { username: targetUser.username, profilePic: targetUser.profilePic, bannerImage: '' });
    }
  }
  res.json({ success: true });
});

router.post('/admin/block/:username', isAdmin, async (req, res) => {
  try {
    const targetUsername = req.params.username;
    const { duration } = req.body;

    const targetUser = await User.findOne({ username: targetUsername });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Role protection
    if (targetUser.role === 'superadmin') {
      return res.status(403).json({ error: 'Cannot block a superadmin' });
    }
    if (req.user.role === 'admin' && targetUser.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot block other admins' });
    }

    let blockedUntil = null;
    if (duration && duration !== 'none') {
      if (duration === 'permanent') {
        blockedUntil = 'permanent';
      } else {
        const minutes = parseInt(duration);
        if (!isNaN(minutes)) {
          blockedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        }
      }
    }

    targetUser.blockedUntil = blockedUntil;
    await targetUser.save();

    if (req.io) {
      req.io.emit('admin-update');
      // Force logout the blocked user if online and newly blocked
      if (blockedUntil && req.io.activeUsers && req.io.activeUsers.has(targetUsername)) {
        const socketId = req.io.activeUsers.get(targetUsername);
        req.io.to(socketId).emit('account-blocked');
      }
    }

    // Fire email in background
    if (duration === 'none') {
      const mailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
          <h2 style="color: #10b981; text-align: center;">Account Unblocked</h2>
          <p style="font-size: 16px;">Hello <strong>${targetUsername}</strong>,</p>
          <p style="font-size: 16px;">Your account on Coll-Connect has been successfully unblocked by an administrator.</p>
          <p style="font-size: 16px;">You can now log in and use the platform normally.</p>
          <br>
          <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
        </div>
      `;
      sendEmail(targetUser.email, 'Your Coll-Connect Account has been Unblocked', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));
    } else {
      const mailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
          <h2 style="color: #ef4444; text-align: center;">Account Blocked</h2>
          <p style="font-size: 16px;">Hello <strong>${targetUsername}</strong>,</p>
          <p style="font-size: 16px;">Your account on Coll-Connect has been blocked ${blockedUntil === 'permanent' ? 'permanently' : 'until ' + new Date(blockedUntil).toLocaleString()}.</p>
          <p style="font-size: 16px;"><strong>Reason:</strong> Violation of community guidelines.</p>
          <br>
          <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Admin Team</p>
        </div>
      `;
      sendEmail(targetUser.email, 'Your Coll-Connect Account has been Blocked', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));
    }

    res.json({ success: true, message: `User block status updated to ${duration}` });
  } catch (err) {
    console.error('Error blocking user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const cascadeDeleteUser = async (username, io) => {
  const user = await User.findOne({ username });
  if (!user) return;
  
  // 1. Delete all messages involving this user & clean up Cloudinary
  const messages = await Message.find({ $or: [{ sender: username }, { receiver: username }] });
  for (const msg of messages) {
    if (msg.fileUrl && msg.fileUrl.includes('cloudinary.com')) {
      await deleteCloudinaryImage(msg.fileUrl, msg.type === 'video' || msg.type === 'audio' ? 'video' : 'image');
    }
  }
  await Message.deleteMany({ $or: [{ sender: username }, { receiver: username }] });
  
  // 2. Delete user's profile and banner images from Cloudinary
  if (user.profilePic) await deleteCloudinaryImage(user.profilePic, 'image');
  if (user.bannerImage) await deleteCloudinaryImage(user.bannerImage, 'image');

  // 3. Remove user from all friends lists, friend requests, and warning history
  await User.updateMany({ friends: username }, { $pull: { friends: username } });
  await User.updateMany({ "friendRequests.username": username }, { $pull: { friendRequests: { username } } });
  
  // 4. Delete Reports & DeletionRequests
  await Report.deleteMany({ $or: [{ reporter: username }, { reportedUser: username }] });
  await DeletionRequest.deleteMany({ username });

  // 5. Delete the user document
  await User.deleteOne({ username });

  // 6. Real-time updates & force logout
  if (io) {
    const activeUsers = io.activeUsers;
    if (activeUsers) {
      const targetSocketId = activeUsers.get(username);
      if (targetSocketId) {
        io.to(targetSocketId).emit('account-deleted');
        activeUsers.delete(username);
      }
    }
    io.emit('admin-update');
    io.emit('chat-cleared', { targetUser: username });
  }
};

router.post('/admin/approve-deletion', isSuperAdmin, async (req, res) => {
  await cascadeDeleteUser(req.body.username, req.io);
  res.json({ success: true });
});

router.post('/admin/force-delete-user', isSuperAdmin, async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const userEmail = user.email;
  const username = user.username;

  await cascadeDeleteUser(req.body.username, req.io);

  // Fire email in background
  const mailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
      <h2 style="color: #ef4444; text-align: center;">Account Terminated</h2>
      <p style="font-size: 16px;">Hello <strong>${username}</strong>,</p>
      <p style="font-size: 16px;">Your account on Coll-Connect has been permanently terminated by the administrative team.</p>
      <p style="font-size: 16px;"><strong>Reason:</strong> Severe or repeated violation of community guidelines.</p>
      <br>
      <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
    </div>
  `;
  sendEmail(userEmail, 'Account Terminated due to Policy Violations', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));

  res.json({ success: true });
});

router.post('/admin/reject-deletion', isSuperAdmin, async (req, res) => {
  await DeletionRequest.deleteOne({ username: req.body.username });
  if (req.io) req.io.emit('admin-update');
  res.json({ success: true });
});

router.post('/admin/dismiss-report', isAdmin, async (req, res) => {
  const report = await Report.findById(req.body.reportId);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  
  if (report.screenshot) {
    await deleteCloudinaryImage(report.screenshot);
  }
  await Report.findByIdAndDelete(req.body.reportId);
  
  if (req.io) req.io.emit('admin-update');
  res.json({ success: true });
});

router.post('/admin/warn-user', isAdmin, async (req, res) => {
  let { reportId, warningMessage } = req.body;
  if (!reportId) return res.status(400).json({ error: 'Report ID required' });

  // Default warning message if none provided
  if (!warningMessage || !warningMessage.trim()) {
    warningMessage = "WARNING: Your account has been reported for violations. Please adhere to the community guidelines. Further violations may result in a permanent ban.";
  }

  // Find the report first, then find the reported user from it (like old system)
  const report = await Report.findById(reportId);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const user = await User.findOne({ username: report.reportedUser });
  if (!user) return res.status(404).json({ error: 'Reported user not found' });

  // Mark report as resolved
  await Report.findByIdAndUpdate(reportId, { status: 'resolved', resolvedBy: req.user.username });

  // Add to warning history (like old system)
  if (!user.warningHistory) user.warningHistory = [];
  user.warningHistory.push({
    date: new Date().toISOString(),
    message: warningMessage,
    reporter: report.reporter,
    reason: report.reason,
    screenshot: report.screenshot,
    byAdmin: req.user.username,
    timestamp: Date.now()
  });

  await user.save();

  // Send warning as a private message to the user (like old system)
  const msg = new Message({
    sender: req.user.username,
    receiver: user.username,
    text: warningMessage,
    type: 'text',
    timestamp: new Date()
  });
  await msg.save();

  // Emit to user's socket if they're online
  if (req.io && req.io.activeUsers) {
    const targetSocketId = req.io.activeUsers.get(user.username);
    if (targetSocketId) {
      req.io.to(targetSocketId).emit('private-message', {
        id: msg._id.toString(),
        sender: req.user.username,
        receiver: user.username,
        text: warningMessage,
        type: 'text',
        timestamp: msg.timestamp
      });
      req.io.to(targetSocketId).emit('warning-received', { message: warningMessage });
    }
  }

  if (req.io) req.io.emit('admin-update');
  res.json({ success: true });
});

router.post('/admin/direct-warn-user', isAdmin, async (req, res) => {
  const { username, duration, customDuration, reason } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: 'User not found' });

  let blockEnd = null;
  if (duration === 'permanent') blockEnd = 'permanent';
  else if (duration !== 'none') {
    const mins = duration === 'custom' ? parseFloat(customDuration) : parseFloat(duration) * 60;
    if (!isNaN(mins) && mins > 0) blockEnd = new Date(Date.now() + mins * 60000);
  }

  if (blockEnd) {
    user.blockedUntil = blockEnd;
    if (req.io) req.io.emit('account-blocked', { username: user.username, duration: blockEnd });
  }

  await user.save();

  const mailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
      <h2 style="color: #ef4444; text-align: center;">Account Blocked</h2>
      <p style="font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
      <p style="font-size: 16px;">Your account on Coll-Connect has been blocked ${blockEnd === 'permanent' ? 'permanently' : 'until ' + new Date(blockEnd).toLocaleString()}.</p>
      <p style="font-size: 16px;"><strong>Reason:</strong> Admin action from dashboard.</p>
      <br>
      <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Admin Team</p>
    </div>
  `;
  sendEmail(user.email, 'Your Coll-Connect Account has been Blocked', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));

  if (req.io) req.io.emit('admin-update');
  res.json({ success: true });
});

router.post('/admin/unblock-user', isAdmin, async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.blockedUntil = undefined;
  await user.save();

  const mailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
      <h2 style="color: #10b981; text-align: center;">Account Unblocked</h2>
      <p style="font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
      <p style="font-size: 16px;">Your account on Coll-Connect has been unblocked. You can now log in and use the platform again.</p>
      <br>
      <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
    </div>
  `;
  sendEmail(user.email, 'Your Coll-Connect Account has been Unblocked', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));

  if (req.io) req.io.emit('admin-update');
  res.json({ success: true });
});

router.get('/admin/analytics', isAdmin, async (req, res) => {
  const data = await Analytics.find().sort({ timestamp: 1 }).limit(168);
  res.json(data);
});

router.post('/admin/promote', isSuperAdmin, async (req, res) => {
  const user = await User.findOneAndUpdate({ username: req.body.username }, { role: 'admin' }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  if (user.email) {
    const mailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
        <h2 style="color: #3b82f6; text-align: center;">Welcome to the Admin Team!</h2>
        <p style="font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
        <p style="font-size: 16px;">Congratulations! You have been officially promoted to the <strong>Admin</strong> role on Coll-Connect by the Superadmin.</p>
        <h3 style="color: #10b981;">Your New Perks & Responsibilities:</h3>
        <ul style="font-size: 15px; line-height: 1.6; background-color: #0f172a; padding: 15px 30px; border-radius: 8px;">
          <li>🛡️ <strong>Global Chat Access:</strong> View and search all public chats on the platform, and chat with ANY user even if they are not your friend.</li>
          <li>👥 <strong>Profile Access & Control:</strong> View detailed profiles of other users, and block or unblock them as necessary.</li>
          <li>⚠️ <strong>Moderation Power:</strong> Issue official warnings to users who violate community guidelines, sending it directly to them.</li>
          <li>🗑️ <strong>Chat Management:</strong> Unsend your own messages and clear chat histories for rule-breakers.</li>
          <li>🛑 <strong>Enforce Rules:</strong> Help keep Coll-Connect a safe and fun place for everyone.</li>
        </ul>
        <p style="font-size: 16px; margin-top: 20px;">Please use your new powers responsibly. We trust you to help maintain the quality of our community!</p>
        <br>
        <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Superadmin</p>
      </div>
    `;
    sendEmail(user.email, '🎉 Congratulations! You have been promoted to Admin', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));
  }

  if (req.io) {
    req.io.emit('admin-update');
    req.io.emit('user-role-changed', { username: req.body.username, newRole: 'admin' });
  }
  res.json({ success: true });
});

router.post('/admin/dismiss', isSuperAdmin, async (req, res) => {
  const { username } = req.body;
  const user = await User.findOneAndUpdate({ username }, { role: 'user' });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.email) {
    const mailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
        <h2 style="color: #ef4444; text-align: center;">Admin Status Update</h2>
        <p style="font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
        <p style="font-size: 16px;">This is a notice to inform you that your <strong>Admin</strong> privileges on Coll-Connect have been revoked by the Superadmin.</p>
        <p style="font-size: 16px;">Your account has been reverted to a standard user role. As a result, your admin powers (such as global chat access, profile viewing, and issuing warnings) are no longer active, and any non-friend chats have been permanently deleted for privacy reasons.</p>
        <p style="font-size: 16px;">If you have any questions or believe this was done in error, please contact the Superadmin.</p>
        <br>
        <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
      </div>
    `;
    sendEmail(user.email, '⚠️ Notice: Admin Status Revoked', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));
  }

  const superadminUser = await User.findOne({ role: 'superadmin' });
  const superadminName = superadminUser ? superadminUser.username : null;
  const userFriends = user.friends || [];

  const allowedOthers = [...userFriends];
  if (superadminName) allowedOthers.push(superadminName);

  const query = {
    $or: [
      { sender: username, receiver: { $nin: allowedOthers } },
      { receiver: username, sender: { $nin: allowedOthers } }
    ]
  };

  const messagesWithMedia = await Message.find({ ...query, fileUrl: { $regex: 'cloudinary.com' } });
  for (const msg of messagesWithMedia) {
    try {
      const parts = msg.fileUrl.split('/');
      const filename = parts.pop().split('.')[0];
      const folder = parts.pop();
      const publicId = `${folder}/${filename}`;
      const resourceType = msg.type === 'video' || msg.type === 'audio' ? 'video' : 'image';
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (err) {
      console.error('Error deleting media from cloudinary on dismiss:', err);
    }
  }

  await Message.deleteMany(query);

  if (req.io) {
    req.io.emit('admin-update');
    req.io.emit('user-role-changed', { username, newRole: 'user' });
    req.io.emit('chat-cleared', { targetUser: username }); // Force clients to clean up
  }
  res.json({ success: true, message: 'Admin dismissed and un-friended chats cleaned up' });
});

module.exports = router;
