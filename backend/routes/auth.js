const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Message = require('../models/Message');
const { sendEmail } = require('../utils/mailer');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const resetCodes = new Map();

async function sendWelcomeMessage(targetUsername, io) {
  try {
    const superadmin = await User.findOne({ role: 'superadmin' });
    const senderName = superadmin ? superadmin.username : 'Prime';

    const welcomeText = `🎉 Welcome to Coll-Connect, ${targetUsername}! 🎉\n\nWe are absolutely thrilled to have you onboard! To ensure you get the most out of our platform, here is a quick guide on how to use all the amazing features we've built for you:\n\n💬 **1. Random Video Chat**\n• Click on "Random Chat" in the sidebar to instantly meet new people.\n• During a call, you can use the **Blur/Unblur** button to maintain privacy.\n• If someone misbehaves, use the **Report** button to notify us immediately.\n• Enjoyed the conversation? Use the **Add Friend** button to stay connected!\n\n🔍 **2. Messages & Time Capsule**\n• Go to the "Messages" tab to chat with your friends.\n• **Time Capsule:** Send special messages that unlock at a future date by clicking the clock icon in the chat!\n• You can search for ANY user globally using the **Search Box** by typing their unique username.\n• From the search results, you can easily send them a Friend Request.\n\n🤫 **3. Whisper Board**\n• Explore the Whisper Board to read and share completely anonymous confessions, thoughts, or secrets with the global community!\n\n👤 **4. My Profile**\n• Your profile is your digital identity. Here you can check your **Friends List** and see your **Profile Visitors** to know who has been checking you out!\n• **Spotify Vibe:** Add your favorite Spotify track link so visitors can listen to your vibe directly from your profile.\n• **Profile Privacy:** You have the option to Lock or Unlock your profile. \n  🔒 **Locked:** Non-friends CANNOT see your social links or friends list.\n  🔓 **Unlocked:** Anyone can view your profile, making it easier to grow your network and popularity!\n\n📢 **5. System Announcements**\n• Keep an eye on the **Bell Icon** in the topbar! This is where you can check official **System Announcements** from "Prime" to stay updated on new features, events, and important platform updates.\n\n🎧 **6. Customer Support**\n• If you ever face any issues, encounter bugs, or need assistance, our **Contact Support** link is available at the bottom of the sidebar! Just click it to reach out to us via email, and we will resolve it as soon as possible.\n\nIf you have any questions, feel free to reach out. Enjoy your time on Coll-Connect, and let the seamless connections begin!\n\nBest Regards,\nThe Admin Team`;

    const msg = new Message({
      sender: senderName,
      receiver: targetUsername,
      text: welcomeText,
      type: 'text',
      timestamp: new Date()
    });
    await msg.save();

    if (io && io.activeUsers) {
      const targetSocketId = io.activeUsers.get(targetUsername);
      if (targetSocketId) {
        io.to(targetSocketId).emit('private-message', {
          id: msg._id.toString(),
          sender: senderName,
          receiver: targetUsername,
          text: welcomeText,
          type: 'text',
          timestamp: msg.timestamp
        });
      }
    }
  } catch(e) {
    console.error('Failed to send welcome message:', e);
  }
}

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') });
  if (!user) return res.status(404).json({ error: 'User with this email not found' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  resetCodes.set(email.toLowerCase(), { code, expiresAt });

  // Send email asynchronously
  const mailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
      <h2 style="color: #3b82f6; text-align: center;">Password Reset OTP</h2>
      <p style="font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
      <p style="font-size: 16px;">You requested to reset your password. Use the OTP below to complete the process. It is valid for 15 minutes.</p>
      <div style="background-color: #374151; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <h1 style="color: #f8fafc; margin: 0; letter-spacing: 4px;">${code}</h1>
      </div>
      <p style="font-size: 16px;">If you did not request this, please ignore this email and your password will remain unchanged.</p>
      <br>
      <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
    </div>
  `;
  try {
    await sendEmail(user.email, '🔐 Password Reset OTP', mailHtml);
  } catch (e) {
    console.error('[Mailer] OTP email failed:', e);
  }

  res.json({ success: true, message: 'If the email exists, an OTP has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'All fields required' });
  const record = resetCodes.get(email.toLowerCase());
  if (!record || Date.now() > record.expiresAt || record.code !== code) return res.status(400).json({ error: 'Invalid or expired code' });

  const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') });
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.password = newPassword;
  await user.save();
  resetCodes.delete(email.toLowerCase());
  // Send email asynchronously
  const mailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e293b; color: #f8fafc; padding: 20px; border-radius: 10px;">
      <h2 style="color: #10b981; text-align: center;">Password Reset Successful</h2>
      <p style="font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
      <p style="font-size: 16px;">Your password has been successfully reset.</p>
      <p style="font-size: 16px;">If you did not make this change, please contact an administrator immediately as your account may be compromised.</p>
      <br>
      <p style="font-size: 14px; color: #94a3b8; text-align: center;">Best regards,<br>The Coll-Connect Team</p>
    </div>
  `;
  
  if (req.io) req.io.emit('admin-update');
  
  res.json({ success: true, message: 'Password reset successfully!' });

  // Fire email in background
  sendEmail(user.email, '✅ Password Reset Successful', mailHtml).catch(e => console.error('[Mailer] Background send failed:', e));
});

router.post('/register', async (req, res) => {
  let { email, username, password } = req.body;
  if (!email || !username || !password) return res.status(400).json({ error: 'All fields required' });
  
  email = email.toLowerCase();
  username = username.toLowerCase();
  
  if (await User.findOne({ email: new RegExp('^' + email + '$', 'i') })) return res.status(400).json({ error: 'Email already registered' });
  if (await User.findOne({ username: new RegExp('^' + username + '$', 'i') })) return res.status(400).json({ error: 'Username taken' });

  const role = email === 'coder.st.15@gmail.com' ? 'superadmin' : 'user';
  const newUser = new User({ email, username, password, role });
  await newUser.save();

  await sendWelcomeMessage(username, req.io);

  if (req.io) req.io.emit('admin-update');

  const token = jwt.sign({ username, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username, role, success: true });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields required' });
  
  const user = await User.findOne({ email: new RegExp('^' + email + '$', 'i'), password });
  if (!user) return res.status(400).json({ error: 'Invalid email or password' });

  if (user.blockedUntil) {
    if (user.blockedUntil === 'permanent') return res.status(403).json({ error: 'Permanently blocked' });
    if (new Date(user.blockedUntil) > new Date()) return res.status(403).json({ error: 'Blocked', blockedUntil: user.blockedUntil });
    user.blockedUntil = undefined;
    await user.save();
  }

  const token = jwt.sign({ username: user.username, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username, role: user.role, success: true });
});

router.post('/auth/google', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token missing' });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const { email, name, picture } = ticket.getPayload();
    
    let user = await User.findOne({ email: new RegExp('^' + email + '$', 'i') });
    if (!user) {
      const baseUsername = (name || 'user').replace(/\\s+/g, '').toLowerCase();
      return res.json({ requiresRegistration: true, email, baseUsername, googleToken: token, picture });
    } else if (!user.profilePic && picture) {
      user.profilePic = picture;
      await user.save();
    }

    if (user.blockedUntil) {
      if (user.blockedUntil === 'permanent') return res.status(403).json({ error: 'Permanently blocked' });
      if (new Date(user.blockedUntil) > new Date()) return res.status(403).json({ error: 'Blocked', blockedUntil: user.blockedUntil });
      user.blockedUntil = undefined;
      await user.save();
    }

    const jwtToken = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: jwtToken, username: user.username, role: user.role, success: true });
  } catch (err) {
    res.status(400).json({ error: 'Google auth failed' });
  }
});

router.post('/auth/google-register', async (req, res) => {
  let { googleToken, username, password } = req.body;
  if (!googleToken || !username || !password) return res.status(400).json({ error: 'All fields required' });
  
  username = username.toLowerCase();
  
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: googleToken, audience: process.env.GOOGLE_CLIENT_ID });
    const { email, picture } = ticket.getPayload();
    
    if (await User.findOne({ email: new RegExp('^' + email + '$', 'i') })) return res.status(400).json({ error: 'Email already registered' });
    if (await User.findOne({ username: new RegExp('^' + username + '$', 'i') })) return res.status(400).json({ error: 'Username taken' });

    const assignedRole = email.toLowerCase() === 'coder.st.15@gmail.com' ? 'superadmin' : 'user';
    const newUser = new User({
      username, email, password, profilePic: picture || '', role: assignedRole
    });
    await newUser.save();

    await sendWelcomeMessage(newUser.username, req.io);

    if (req.io) req.io.emit('admin-update');

    const jwtToken = jwt.sign({ username: newUser.username, email: newUser.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: jwtToken, username: newUser.username, role: newUser.role, success: true });
  } catch(err) {
    res.status(400).json({ error: 'Google auth failed' });
  }
});


module.exports = router;

