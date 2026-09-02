// restart
require('dotenv').config();
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const jwt = require('jsonwebtoken');
require('dotenv').config(); // Load environment variables!
const nodemailer = require('nodemailer');

let analyticsData = [];
try {
  analyticsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'analytics.json')));
} catch (e) {
  // If file doesn't exist, ignore
}

// Track every 1 hour (3600000 ms)
setInterval(() => {
  const timestamp = new Date().toISOString();
  analyticsData.push({ timestamp, count: activeUsers.size });
  // Keep last 168 hours (7 days)
  if (analyticsData.length > 168) {
    analyticsData.shift();
  }
  fs.writeFileSync(path.join(__dirname, 'analytics.json'), JSON.stringify(analyticsData));
}, 3600000);

const JWT_SECRET = 'super-secret-key-123'; // In production, use env variable

const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir);
}

const deletionRequestsPath = path.join(__dirname, 'deletion_requests.json');
let deletionRequests = [];
if (fs.existsSync(deletionRequestsPath)) {
  try {
    deletionRequests = JSON.parse(fs.readFileSync(deletionRequestsPath, 'utf8'));
  } catch (e) {
    console.error("Error reading deletion requests", e);
  }
}

const saveDeletionRequests = () => {
  fs.writeFileSync(deletionRequestsPath, JSON.stringify(deletionRequests, null, 2));
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_APP_PASSWORD
  }
});

const usersDbPath = path.join(__dirname, 'users.json');
let usersDb = [];
if (fs.existsSync(usersDbPath)) {
  try {
    usersDb = JSON.parse(fs.readFileSync(usersDbPath, 'utf8'));
  } catch (e) {
    console.error("Error reading users db", e);
  }
}

const saveUsers = () => {
  fs.writeFileSync(usersDbPath, JSON.stringify(usersDb, null, 2));
};

const messagesDbPath = path.join(__dirname, 'messages.json');
let messagesDb = [];
if (fs.existsSync(messagesDbPath)) {
  try {
    messagesDb = JSON.parse(fs.readFileSync(messagesDbPath, 'utf8'));
  } catch (e) {
    console.error("Error reading messages db", e);
  }
}

const saveMessages = () => {
  fs.writeFileSync(messagesDbPath, JSON.stringify(messagesDb, null, 2));
};

const cleanExpiredFriendRequests = () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let changed = false;
  usersDb.forEach(u => {
    if (u.friendRequests && Array.isArray(u.friendRequests)) {
      const originalLength = u.friendRequests.length;
      u.friendRequests = u.friendRequests.filter(req => {
        if (typeof req === 'string') return true; // Legacy
        if (req && req.timestamp) {
          return now - req.timestamp <= SEVEN_DAYS_MS;
        }
        return true;
      });
      if (u.friendRequests.length !== originalLength) {
        changed = true;
      }
    }
  });
  if (changed) saveUsers();
};
// Clean on boot and periodically
cleanExpiredFriendRequests();
setInterval(cleanExpiredFriendRequests, 60 * 60 * 1000);

const supportDbPath = path.join(__dirname, 'support_tickets.json');
let supportTicketsDb = [];
if (fs.existsSync(supportDbPath)) {
  try {
    supportTicketsDb = JSON.parse(fs.readFileSync(supportDbPath, 'utf8'));
  } catch (e) {
    console.error("Error reading support db", e);
  }
}

const saveSupportTickets = () => {
  fs.writeFileSync(supportDbPath, JSON.stringify(supportTicketsDb, null, 2));
};

const announcementsDbPath = path.join(__dirname, 'announcements.json');
let announcementsDb = [];
if (fs.existsSync(announcementsDbPath)) {
  try {
    announcementsDb = JSON.parse(fs.readFileSync(announcementsDbPath, 'utf8'));
  } catch (e) {
    console.error("Error reading announcements db", e);
  }
}

const saveAnnouncements = () => {
  fs.writeFileSync(announcementsDbPath, JSON.stringify(announcementsDb, null, 2));
};
const cascadeDeleteUser = (emailOrUsername) => {
  const userIndex = usersDb.findIndex(u => u.email === emailOrUsername || u.username === emailOrUsername);
  let deletedUsername = null;
  if (userIndex !== -1) {
    deletedUsername = usersDb[userIndex].username;
    usersDb.splice(userIndex, 1);
    
    usersDb.forEach(u => {
      if (u.friends) u.friends = u.friends.filter(f => f !== deletedUsername);
      if (u.friendRequests) u.friendRequests = u.friendRequests.filter(fr => {
        const username = typeof fr === 'string' ? fr : fr.username;
        return username !== deletedUsername;
      });
    });
    saveUsers();

    const filteredMessages = messagesDb.filter(m => m.sender !== deletedUsername && m.receiver !== deletedUsername && m.from !== deletedUsername && m.to !== deletedUsername);
    messagesDb.length = 0;
    messagesDb.push(...filteredMessages);
    saveMessages();

    const logPath = path.join(reportsDir, 'reports.json');
    if (fs.existsSync(logPath)) {
      try {
        let existingLogs = JSON.parse(fs.readFileSync(logPath));
        existingLogs = existingLogs.filter(r => r.reporter !== deletedUsername && r.reportedUser !== deletedUsername);
        fs.writeFileSync(logPath, JSON.stringify(existingLogs, null, 2));
      } catch(e) { console.error("Error updating reports.json", e); }
    }

    const targetSocketId = activeUsers.get(deletedUsername);
    if (targetSocketId) {
      io.to(targetSocketId).emit('account-blocked', { duration: 'permanent' });
    }
    io.emit('user-deleted', { username: deletedUsername });
  }

  deletionRequests = deletionRequests.filter(r => r.email !== emailOrUsername && r.username !== emailOrUsername && r.username !== deletedUsername);
  saveDeletionRequests();
};

const resetCodes = new Map(); // Store as { email: { code, expiresAt } }

app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = usersDb.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User with this email not found' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

  resetCodes.set(email.toLowerCase(), { code, expiresAt });

  const mailOptions = {
    from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
    to: user.email,
    subject: 'Password Reset Code - Coll-Connect',
    text: `Your password reset code is: ${code}\nThis code will expire in 15 minutes.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending reset email:', error);
      require('fs').appendFileSync('email_debug.log', new Date().toISOString() + " ERROR forgot-password: " + error.message + "\n");
      console.log(`[DEV MODE] Reset code for ${email} is ${code}`);
    } else {
      require('fs').appendFileSync('email_debug.log', new Date().toISOString() + " SUCCESS forgot-password: " + info.response + "\n");
    }
  });

  res.json({ success: true, message: 'Reset code sent to email.' });
});

app.get('/api/test-mailer', (req, res) => {
  transporter.sendMail({
    from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
    to: process.env.ADMIN_EMAIL,
    subject: 'Ping from backend',
    text: 'Test backend mailer route.'
  }, (err, info) => {
    if (err) return res.status(500).json({ error: err.message, env: process.env.ADMIN_EMAIL });
    res.json({ success: true, info: info.response, env: process.env.ADMIN_EMAIL });
  });
});

app.get('/api/debug-env', (req, res) => {
  res.json({ 
    adminEmail: process.env.ADMIN_EMAIL ? 'SET' : 'NOT SET', 
    emailValue: process.env.ADMIN_EMAIL 
  });
});

app.post('/api/upload', (req, res) => {
  const { fileData, fileType } = req.body;
  if (!fileData) return res.status(400).json({ error: 'No file data' });
  try {
    const base64Data = fileData.replace(/^data:([A-Za-z-+/]+);base64,/, '');
    const extension = fileType === 'audio' ? 'webm' : 'jpg';
    const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, base64Data, 'base64');
    res.json({ url: `/uploads/${fileName}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/test-mailer-sync', async (req, res) => {
  try {
    const info = await transporter.sendMail({
      from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
      to: process.env.ADMIN_EMAIL,
      subject: 'Sync Ping',
      text: 'Testing sync'
    });
    res.json({ success: true, info: info.response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'All fields are required' });

  const record = resetCodes.get(email.toLowerCase());
  if (!record) return res.status(400).json({ error: 'Invalid or expired reset code' });

  if (Date.now() > record.expiresAt) {
    resetCodes.delete(email.toLowerCase());
    return res.status(400).json({ error: 'Reset code has expired' });
  }

  if (record.code !== code) {
    return res.status(400).json({ error: 'Invalid reset code' });
  }

  const user = usersDb.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.password = newPassword;
  saveUsers();
  resetCodes.delete(email.toLowerCase());

  res.json({ success: true, message: 'Password has been reset successfully' });
});

app.post('/api/register', (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) return res.status(400).json({ error: 'All fields required' });
  
  if (usersDb.find(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(400).json({ error: 'Email already registered' });
  if (usersDb.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: 'Username taken' });

  const role = email.toLowerCase() === 'coder.st.15@gmail.com' ? 'superadmin' : 'user';
  const newUser = { email, username, password, role, gender: 'Not Specified', socials: { linkedin: '', facebook: '', instagram: '', snapchat: '' }, friends: [], friendRequests: [] };
  usersDb.push(newUser);
  saveUsers();

  const token = jwt.sign({ username, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username, role, success: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields required' });

  const user = usersDb.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) return res.status(400).json({ error: 'Invalid email or password' });

  if (user.blockedUntil) {
    if (user.blockedUntil === 'permanent') {
      return res.status(403).json({ error: 'Your account has been permanently blocked.' });
    }
    const blockTime = new Date(user.blockedUntil);
    if (blockTime > new Date()) {
      return res.status(403).json({ error: `Your account is blocked until ${blockTime.toLocaleString()}` });
    } else {
      delete user.blockedUntil;
      saveUsers();
    }
  }

  const token = jwt.sign({ username: user.username, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username, role: user.role || 'user', success: true });
});

app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token missing' });
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    
    let user = usersDb.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      const baseUsername = (name || 'user').replace(/\s+/g, '').toLowerCase();
      let uniqueUsername = baseUsername;
      let counter = 1;
      while (usersDb.find(u => u.username.toLowerCase() === uniqueUsername)) {
        uniqueUsername = `${baseUsername}${counter}`;
        counter++;
      }
      user = {
        username: uniqueUsername,
        email,
        password: Math.random().toString(36).slice(-8),
        gender: '',
        profilePic: picture || '',
        joinedAt: new Date().toISOString(),
        role: 'user'
      };
      usersDb.push(user);
      saveUsers();
    } else {
      if (!user.profilePic && picture) {
        user.profilePic = picture;
        saveUsers();
      }
    }
    
    if (user.blockedUntil) {
      if (user.blockedUntil === 'permanent') {
        return res.status(403).json({ error: 'Your account has been permanently blocked.' });
      }
      const blockTime = new Date(user.blockedUntil);
      if (blockTime > new Date()) {
        return res.status(403).json({ error: `Your account is blocked until ${blockTime.toLocaleString()}` });
      } else {
        delete user.blockedUntil;
        saveUsers();
      }
    }

    const jwtToken = jwt.sign({ username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: jwtToken, username: user.username, role: user.role || 'user', success: true });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(400).json({ error: 'Google authentication failed' });
  }
});

// --- New Profile and Friend APIs ---
app.get('/api/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user) return res.status(404).json({ error: 'Not found' });
    
    if (user.blockedUntil) {
      if (user.blockedUntil === 'permanent') {
        return res.status(403).json({ error: 'Your account has been permanently blocked.' });
      }
      const blockTime = new Date(user.blockedUntil);
      if (blockTime > new Date()) {
        return res.status(403).json({ error: `Your account is blocked until ${blockTime.toLocaleString()}` });
      } else {
        delete user.blockedUntil;
        saveUsers();
      }
    }
      const actualFriends = user.friends || [];
      const interactedUsers = new Set();
      
      messagesDb.forEach(m => {
        if (m.sender === user.username) interactedUsers.add(m.receiver);
        if (m.receiver === user.username) interactedUsers.add(m.sender);
        if (m.from === user.username) interactedUsers.add(m.to);
        if (m.to === user.username) interactedUsers.add(m.from);
      });
      
      const friendsAndInteracted = new Set([...actualFriends, ...interactedUsers]);

      let friendsList = Array.from(friendsAndInteracted)
        .filter(u => u !== user.username && u.toLowerCase() !== 'admin')
        .map(uname => usersDb.find(user => user.username === uname))
        .filter(u => u !== undefined)
        .map(u => ({
          username: u.username,
          email: u.email,
          profilePic: u.profilePic || '',
          gender: u.gender || 'Not Specified',
          socials: u.socials || {},
          role: u.role || 'user',
          isFriend: actualFriends.includes(u.username),
          warningHistory: u.warningHistory || [],
          blockedUntil: u.blockedUntil || null
        }));

      const isMeAdmin = user.role === 'admin' || user.role === 'superadmin';
      if (!isMeAdmin) {
        friendsList = friendsList.filter(f => {
          if (f.isFriend) return true;
          const isThemAdmin = f.role === 'admin' || f.role === 'superadmin';
          return isThemAdmin;
        });
      }
      
      const superadminUser = usersDb.find(u => u.role === 'superadmin');
      if (superadminUser && user.role !== 'superadmin' && !friendsList.find(f => f.username === superadminUser.username)) {
        friendsList.push({
          username: superadminUser.username,
          profilePic: superadminUser.profilePic || '',
          gender: superadminUser.gender || 'Not Specified',
          socials: superadminUser.socials || {},
          role: 'superadmin',
          isFriend: true
        });
      }

      res.json({
        username: user.username,
        email: user.email,
        profilePic: user.profilePic || '',
        gender: user.gender || 'Not Specified',
        socials: user.socials || { linkedin: '', facebook: '', instagram: '', snapchat: '' },
        friends: friendsList,
        friendRequests: (user.friendRequests || []).map(r => {
          const reqUsername = typeof r === 'string' ? r : r.username;
          const reqUser = usersDb.find(u => u.username === reqUsername) || { username: reqUsername };
          return {
            username: reqUser.username,
            profilePic: reqUser.profilePic || '',
            gender: reqUser.gender || 'Not Specified',
            socials: reqUser.socials || {},
            role: reqUser.role || 'user'
          };
        }),
        role: user.role || 'user'
    });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/profile-pic', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user) return res.status(404).json({ error: 'Not found' });
    user.profilePic = req.body.profilePic || '';
    saveUsers();
    res.json({ success: true, profilePic: user.profilePic });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/profile/socials', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user) return res.status(404).json({ error: 'Not found' });
    
    user.socials = req.body.socials || { linkedin: '', facebook: '', instagram: '', snapchat: '' };
    saveUsers();
    
    io.emit('admin-update');
    
    res.json({ success: true, socials: user.socials });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/profile/gender', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user) return res.status(404).json({ error: 'Not found' });
    
    user.gender = req.body.gender || 'Not Specified';
    saveUsers();
    
    io.emit('admin-update');
    
    res.json({ success: true, gender: user.gender });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/profile/change-username', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const oldUsername = decoded.username;
    let { newUsername } = req.body;
    
    if (!newUsername) return res.status(400).json({ error: 'New username required' });
    newUsername = newUsername.trim();
    if (newUsername.length < 3 || newUsername.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    
    if (usersDb.some(u => u.username.toLowerCase() === newUsername.toLowerCase())) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    const user = usersDb.find(u => u.username === oldUsername);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    if (user.lastUsernameChangeDate && Date.now() - user.lastUsernameChangeDate < oneYearMs) {
      return res.status(400).json({ error: 'You can only change your username once a year.' });
    }
    
    user.username = newUsername;
    user.lastUsernameChangeDate = Date.now();
    
    usersDb.forEach(u => {
      if (u.friends) u.friends = u.friends.map(f => f === oldUsername ? newUsername : f);
      if (u.friendRequests) u.friendRequests = u.friendRequests.map(fr => {
        if (typeof fr === 'string') return fr === oldUsername ? newUsername : fr;
        if (fr.username === oldUsername) return { ...fr, username: newUsername };
        return fr;
      });
      if (u.warningHistory) {
        u.warningHistory.forEach(w => {
          if (w.byAdmin === oldUsername) w.byAdmin = newUsername;
        });
      }
    });
    
    messagesDb.forEach(m => {
      if (m.sender === oldUsername) m.sender = newUsername;
      if (m.receiver === oldUsername) m.receiver = newUsername;
    });
    
    saveUsers();
    saveMessages();
    
    const token = jwt.sign({ username: newUsername, role: user.role }, JWT_SECRET);
    io.emit('admin-update');
    
    res.json({ success: true, token, newUsername });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.get('/api/users/search', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json([]);
    const matches = usersDb
      .filter(u => u.username.toLowerCase().includes(q) && u.username !== decoded.username && u.username !== 'admin')
      .map(u => ({ 
        username: u.username, 
        profilePic: u.profilePic || '',
        gender: u.gender || 'Not Specified',
        socials: u.socials || {},
        role: u.role || 'user',
        hasSentRequest: u.friendRequests ? u.friendRequests.some(fr => (typeof fr === 'string' ? fr : fr.username) === decoded.username) : false
      }));
    res.json(matches);
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/friend-request', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const targetUser = usersDb.find(u => u.username === req.body.targetUsername);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });
    if (!targetUser.friendRequests) targetUser.friendRequests = [];
    if (!targetUser.friends) targetUser.friends = [];
    
    if (targetUser.friends.includes(decoded.username)) return res.status(400).json({ error: 'Already friends' });
    const hasSent = targetUser.friendRequests.some(fr => (typeof fr === 'string' ? fr : fr.username) === decoded.username);
    if (hasSent) return res.status(400).json({ error: 'Request already sent' });
    
    targetUser.friendRequests.push({ username: decoded.username, timestamp: Date.now() });
    saveUsers();

    const targetSocketId = activeUsers.get(targetUser.username);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend-request-received', decoded.username);
    }

    res.json({ success: true });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/friend-accept', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const me = usersDb.find(u => u.username === decoded.username);
    const targetUsername = req.body.targetUsername;
    const targetUser = usersDb.find(u => u.username === targetUsername);
    
    if (!me || !targetUser) return res.status(404).json({ error: 'User not found' });
    
    if (!me.friends) me.friends = [];
    if (!targetUser.friends) targetUser.friends = [];
    if (!me.friendRequests) me.friendRequests = [];

    me.friendRequests = me.friendRequests.filter(u => {
      const uname = typeof u === 'string' ? u : u.username;
      return uname !== targetUsername;
    });
    if (!me.friends.includes(targetUsername)) me.friends.push(targetUsername);
    if (!targetUser.friends.includes(me.username)) targetUser.friends.push(me.username);
    
    saveUsers();

    const targetSocketId = activeUsers.get(targetUsername);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend-request-accepted', me.username);
    }

    res.json({ success: true });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/friend-decline', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const me = usersDb.find(u => u.username === decoded.username);
    const targetUsername = req.body.targetUsername;
    
    if (!me) return res.status(404).json({ error: 'User not found' });
    
    if (me.friendRequests) {
      me.friendRequests = me.friendRequests.filter(u => {
        const uname = typeof u === 'string' ? u : u.username;
        return uname !== targetUsername;
      });
      saveUsers();
    }

    const targetSocketId = activeUsers.get(targetUsername);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend-request-declined', me.username);
    }

    res.json({ success: true });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/unfriend', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const me = usersDb.find(u => u.username === decoded.username);
    const targetUsername = req.body.targetUsername;
    const targetUser = usersDb.find(u => u.username === targetUsername);
    
    if (!me || !targetUser) return res.status(404).json({ error: 'User not found' });
    
    if (me.friends) me.friends = me.friends.filter(u => u !== targetUsername);
    if (targetUser.friends) targetUser.friends = targetUser.friends.filter(u => u !== me.username);
    
    const isMeAdmin = me.role === 'admin' || me.role === 'superadmin';
    const isTargetAdmin = targetUser.role === 'admin' || targetUser.role === 'superadmin';
    
    if (!isMeAdmin && !isTargetAdmin) {
      const filteredMessages = messagesDb.filter(m => !(
        (m.sender === me.username && m.receiver === targetUsername) ||
        (m.sender === targetUsername && m.receiver === me.username)
      ));
      messagesDb.length = 0;
      messagesDb.push(...filteredMessages);
      saveMessages();
      
      io.emit('chat-cleared', { targetUser: targetUsername });
      io.emit('chat-cleared', { targetUser: me.username });
    }

    saveUsers();
    
    const targetSocketId = activeUsers.get(targetUsername);
    if (targetSocketId) {
      io.to(targetSocketId).emit('unfriended', me.username);
    }

    res.json({ success: true });
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.get('/api/messages/:friend', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const me = decoded.username;
    const friend = req.params.friend;
    
    const history = messagesDb.filter(m => 
      (m.sender === me && m.receiver === friend) || 
      (m.sender === friend && m.receiver === me)
    );
    res.json(history);
  } catch(e) { res.status(401).json({error: 'Invalid token'}); }
});

app.post('/api/account/request-deletion', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const userEmail = decoded.email || usersDb.find(u => u.username === decoded.username)?.email;

    if (!userEmail) return res.status(400).json({ error: 'User email not found.' });

    if (deletionRequests.find(r => r.username === decoded.username)) {
      return res.status(400).json({ error: 'Deletion request already pending.' });
    }

    const newRequest = {
      email: userEmail,
      username: decoded.username,
      timestamp: new Date().toISOString()
    };
    deletionRequests.push(newRequest);
    saveDeletionRequests();
    io.emit('admin-update');
    
    const mailOptions = {
      from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
      to: userEmail,
      subject: 'Coll-Connect Account Deletion Request Received',
      text: `Hello,\n\nWe have received your request to delete your Coll-Connect account. An admin will review it shortly. You will be notified once it is processed.\n\nThank you.`
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        require('fs').appendFileSync('email_debug.log', new Date().toISOString() + " ERROR requesting deletion: " + error.message + "\n");
      } else {
        console.log(`[Email Sent] Deletion requested mail to ${userEmail}`);
        require('fs').appendFileSync('email_debug.log', new Date().toISOString() + " SUCCESS requesting deletion: " + info.response + "\n");
      }
    });

    res.json({ success: true, message: 'Deletion request sent to admin.' });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

const isAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const isSuperAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden. SuperAdmin access required.' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/api/admin/deletion-requests', isSuperAdmin, (req, res) => {
  const logPath = path.join(reportsDir, 'reports.json');
  let logs = [];
  if (fs.existsSync(logPath)) {
    try {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {}
  }

  const mappedRequests = deletionRequests.map(req => {
    const userReports = logs.filter(log => log.reported.toLowerCase() === req.username.toLowerCase());
    return {
      ...req,
      reportCount: userReports.length,
      reports: userReports
    };
  });

  res.json({ requests: mappedRequests });
});
app.get('/api/admin/users', isAdmin, (req, res) => {
  const logPath = path.join(reportsDir, 'reports.json');
  let logs = [];
  if (fs.existsSync(logPath)) {
    try {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {
      console.error("Error reading reports file", e);
    }
  }

  const mappedUsers = usersDb.map(u => {
    const userReports = logs.filter(log => log.reported.toLowerCase() === u.username.toLowerCase());
    const safeUser = { ...u };
    if (req.user.role !== 'superadmin') {
      delete safeUser.password;
      delete safeUser.email;
    }

    return {
      ...safeUser,
      reportCount: userReports.length,
      reports: userReports
    };
  });

  res.json({ users: mappedUsers });
});

app.post('/api/admin/approve-deletion', isSuperAdmin, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  cascadeDeleteUser(email);

  const mailOptions = {
    from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
    to: email,
    subject: 'Your Coll-Connect Account has been Deleted',
    text: `Hello,\n\nYour account deletion request has been processed. Your account on Coll-Connect has been permanently deleted.\n\nThank you.`
  };
  
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      require('fs').appendFileSync('email_debug.log', new Date().toISOString() + " ERROR approving deletion: " + error.message + "\n");
    } else {
      console.log(`[Email Sent] Account deleted mail to ${email}`);
      require('fs').appendFileSync('email_debug.log', new Date().toISOString() + " SUCCESS approving deletion: " + info.response + "\n");
    }
  });

  res.json({ success: true });
});

app.post('/api/admin/force-delete-user', isSuperAdmin, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  cascadeDeleteUser(email);

  res.json({ message: 'User account force deleted successfully' });
});

app.post('/api/admin/reject-deletion', isSuperAdmin, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  deletionRequests = deletionRequests.filter(r => r.email !== email);
  saveDeletionRequests();

  const mailOptions = {
    from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
    to: email,
    subject: 'Coll-Connect Account Deletion Request Rejected',
    text: `Hello,\n\nYour account deletion request on Coll-Connect has been rejected by an admin. If you have any questions, please contact support.\n\nThank you.`
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      require('fs').appendFileSync('email_debug.log', new Date().toISOString() + " ERROR rejecting deletion: " + error.message + "\n");
    } else {
      console.log(`[Email Sent] Request rejected mail to ${email}`);
      require('fs').appendFileSync('email_debug.log', new Date().toISOString() + " SUCCESS rejecting deletion: " + info.response + "\n");
    }
  });

  res.json({ success: true });
});

app.post('/api/admin/dismiss-report', isAdmin, (req, res) => {
  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'Report ID required' });

  const logPath = path.join(reportsDir, 'reports.json');
  if (fs.existsSync(logPath)) {
    try {
      let logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      const report = logs.find(l => l.id === reportId);
      if (report) {
        logs = logs.filter(l => l.id !== reportId);
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
        
        if (report.screenshot) {
          const imagePath = path.join(reportsDir, report.screenshot);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
        
        io.emit('admin-update');
        return res.json({ success: true });
      }
    } catch (e) {
      console.error("Error dismissing report", e);
    }
  }
  
  res.status(404).json({ error: 'Report not found' });
});

app.post('/api/admin/warn-user', isAdmin, (req, res) => {
  let { reportId, warningMessage } = req.body;
  if (!reportId) return res.status(400).json({ error: 'Report ID required' });
  
  if (!warningMessage || !warningMessage.trim()) {
    warningMessage = "⚠ WARNING: Your account has been reported for violations. Please adhere to the community guidelines. Further violations may result in a permanent ban.";
  }

  const logPath = path.join(reportsDir, 'reports.json');
  if (fs.existsSync(logPath)) {
    try {
      let logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      const report = logs.find(l => l.id === reportId);
      if (report) {
        const user = usersDb.find(u => u.username.toLowerCase() === report.reported.toLowerCase());
        if (user) {
          if (!user.warningHistory) user.warningHistory = [];
          user.warningHistory.push({
            date: new Date().toISOString(),
            message: warningMessage,
            reportId: report.id,
            reporter: report.reporter,
            reason: report.reason,
            screenshot: report.screenshot
          });
          saveUsers();

          const msg = {
            id: Date.now().toString(),
            sender: req.user.username,
            receiver: user.username,
            text: warningMessage,
            type: 'text',
            timestamp: new Date().toISOString()
          };
          messagesDb.push(msg);
          saveMessages();

          const targetSocketId = activeUsers.get(user.username);
          if (targetSocketId) {
            io.to(targetSocketId).emit('private-message', msg);
          }
        }

        // Dismiss active report but DO NOT delete screenshot (it is now archived)
        logs = logs.filter(l => l.id !== reportId);
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
        
        io.emit('admin-update');
        return res.json({ success: true });
      }
    } catch (e) {
      console.error("Error warning user", e);
    }
  }
  
  res.status(404).json({ error: 'Report not found' });
});

app.post('/api/admin/direct-warn-user', isAdmin, (req, res) => {
  let { username, warningMessage } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  if (!warningMessage || !warningMessage.trim()) {
    warningMessage = "⚠ WARNING: Please adhere to the community guidelines. Further violations may result in a permanent ban.";
  }

  const user = usersDb.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Add warning to user history
  if (!user.warningHistory) user.warningHistory = [];
  user.warningHistory.push({
    date: new Date().toISOString(),
    message: warningMessage,
    type: 'direct_warning'
  });
  saveUsers();

  // Send actual warning message to user
  const msg = {
    id: Date.now().toString(),
    sender: req.user.username,
    receiver: user.username,
    text: warningMessage,
    type: 'text',
    timestamp: new Date().toISOString()
  };
  messagesDb.push(msg);
  saveMessages();
  
  const targetSocketId = activeUsers.get(user.username);
  if (targetSocketId) {
    io.to(targetSocketId).emit('private-message', msg);
  }
  
  res.json({ success: true });
});

app.post('/api/admin/block-user', isAdmin, (req, res) => {
  const { email, username, duration } = req.body;
  const user = usersDb.find(u => u.email === email || u.username === username || u.email === username || u.username === email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (req.user.role === 'admin' && (user.role === 'admin' || user.role === 'superadmin')) {
    return res.status(403).json({ error: 'Admins cannot block other admins or superadmins.' });
  }

  let blockedUntil = 'permanent';
  if (duration !== 'permanent') {
    const hours = parseFloat(duration);
    const date = new Date();
    date.setTime(date.getTime() + hours * 60 * 60 * 1000);
    blockedUntil = date.toISOString();
  }

  user.blockedUntil = blockedUntil;
  saveUsers();

  const socketId = activeUsers.get(user.username);
  if (socketId) {
    io.to(socketId).emit('account-blocked', { duration: blockedUntil });
  }

  const mailOptions = {
    from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
    to: user.email,
    subject: 'Your Coll-Connect Account has been Blocked',
    text: `Hello,\n\nYour account on Coll-Connect has been blocked ${blockedUntil === 'permanent' ? 'permanently' : 'until ' + new Date(blockedUntil).toLocaleString()}.\n\nReason: Multiple reports against your account.\n\nThank you.`
  };
  
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_APP_PASSWORD) {
    transporter.sendMail(mailOptions, (e) => { if(e) console.error(e); });
  }

  res.json({ success: true, blockedUntil });
});

app.post('/api/admin/unblock-user', isAdmin, (req, res) => {
  const { email, username } = req.body;
  const user = usersDb.find(u => u.email === email || u.username === username || u.email === username || u.username === email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (req.user.role === 'admin' && (user.role === 'admin' || user.role === 'superadmin')) {
    return res.status(403).json({ error: 'Admins cannot unblock other admins or superadmins.' });
  }

  delete user.blockedUntil;
  saveUsers();

  const mailOptions = {
    from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
    to: user.email,
    subject: 'Your Coll-Connect Account has been Unblocked',
    text: `Hello,\n\nYour account on Coll-Connect has been unblocked. You can now log in and use the platform again.\n\nThank you.`
  };
  
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_APP_PASSWORD) {
    transporter.sendMail(mailOptions, (e) => { if(e) console.error(e); });
  }

  res.json({ success: true });
});

app.get('/api/admin/analytics', isAdmin, (req, res) => {
  res.json({ analytics: analyticsData });
});

app.post('/api/admin/promote', isSuperAdmin, (req, res) => {
  const { username } = req.body;
  const user = usersDb.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.role = 'admin';
  saveUsers();
  io.emit('user-role-changed', { username: user.username, newRole: 'admin' });
  res.json({ success: true, message: 'User promoted to Admin' });
});

app.post('/api/admin/dismiss', isSuperAdmin, (req, res) => {
  const { username } = req.body;
  const user = usersDb.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.role = 'user';
  saveUsers();

  const userFriends = user.friends || [];
  const superadminUser = usersDb.find(u => u.role === 'superadmin');
  const superadminName = superadminUser ? superadminUser.username : null;
  
  const filteredMessages = messagesDb.filter(m => {
    if (m.sender === username) {
      if (m.receiver !== superadminName && !userFriends.includes(m.receiver)) return false; 
    }
    if (m.receiver === username) {
      if (m.sender !== superadminName && !userFriends.includes(m.sender)) return false;
    }
    return true;
  });
  messagesDb.length = 0;
  messagesDb.push(...filteredMessages);
  saveMessages();

  io.emit('user-role-changed', { username: user.username, newRole: 'user' });

  res.json({ success: true, message: 'Admin dismissed and un-friended chats cleaned up' });
});

// Support Tickets Endpoints
app.post('/api/support', (req, res) => {
  const { email, subject, description } = req.body;
  const ticket = {
    id: Date.now().toString(),
    email,
    subject,
    description,
    timestamp: new Date().toISOString(),
    status: 'open'
  };
  supportTicketsDb.push(ticket);
  saveSupportTickets();
  res.json({ success: true, ticket });
});

app.get('/api/support', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    res.json(supportTicketsDb);
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/api/support/:id/resolve', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    
    const ticket = supportTicketsDb.find(t => t.id === req.params.id);
    if (ticket) {
      ticket.status = 'resolved';
      saveSupportTickets();
      res.json({ success: true, ticket });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/support/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    
    const idx = supportTicketsDb.findIndex(t => t.id === req.params.id);
    if (idx !== -1) {
      supportTicketsDb.splice(idx, 1);
      saveSupportTickets();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Announcements Endpoints
app.get('/api/announcements', (req, res) => {
  res.json(announcementsDb);
});

app.post('/api/announcements', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    
    const { text } = req.body;
    const announcement = {
      id: Date.now().toString(),
      text,
      timestamp: new Date().toISOString(),
      type: 'announcement'
    };
    announcementsDb.push(announcement);
    saveAnnouncements();
    
    io.emit('new-announcement', announcement);
    res.json({ success: true, announcement });
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/announcements/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = usersDb.find(u => u.username === decoded.username);
    if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    
    const idx = announcementsDb.findIndex(a => a.id === req.params.id);
    if (idx !== -1) {
      announcementsDb.splice(idx, 1);
      saveAnnouncements();
      
      // Tell clients to refresh announcements
      io.emit('announcement-deleted', req.params.id);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

let waitingUsers = [];
let activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register-active', (username) => {
    const u = usersDb.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (u && u.blockedUntil) {
      const blockTime = new Date(u.blockedUntil);
      if (u.blockedUntil === 'permanent' || blockTime > new Date()) {
        socket.emit('account-blocked', { duration: u.blockedUntil });
        return;
      }
    }
    const actualUsername = u ? u.username : username;
    socket.username = actualUsername;
    activeUsers.set(actualUsername, socket.id);
  });

  socket.on('private-message', ({ id, to, text, type = 'text', fileUrl }) => {
    if (!socket.username) return;

    const senderUser = usersDb.find(u => u.username === socket.username);
    const receiverUser = usersDb.find(u => u.username === to);

    if (senderUser && senderUser.blockedUntil) {
      const blockTime = new Date(senderUser.blockedUntil);
      if (senderUser.blockedUntil === 'permanent' || blockTime > new Date()) {
        socket.emit('chat-error', { message: 'Your account is blocked.' });
        return;
      }
    }

    if (senderUser && receiverUser) {
      const isSenderAdmin = senderUser.role === 'admin' || senderUser.role === 'superadmin';
      const isReceiverAdmin = receiverUser.role === 'admin' || receiverUser.role === 'superadmin';
      const areFriends = (senderUser.friends || []).includes(receiverUser.username) || (receiverUser.friends || []).includes(senderUser.username);
      const isSystemAdmin = senderUser.username.toLowerCase() === 'admin' || receiverUser.username.toLowerCase() === 'admin';

      if (!isSenderAdmin && !isReceiverAdmin && !areFriends && !isSystemAdmin) {
        socket.emit('chat-error', { message: 'You can only chat with your friends.' });
        return;
      }
    }

    const msg = {
      id: id || (Date.now().toString() + Math.random().toString(36).substring(7)),
      sender: socket.username,
      receiver: to,
      text: text,
      type: type,
      fileUrl: fileUrl,
      timestamp: new Date().toISOString()
    };
    
    messagesDb.push(msg);
    saveMessages();

    // Send to recipient if online
    const targetSocketId = activeUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('private-message', msg);
    }
  });

  socket.on('private-reaction', ({ messageId, to, emoji }) => {
    if (!socket.username) return;

    // We don't save private reactions to the db yet to keep it simple,
    // just relay it in real-time.
    const targetSocketId = activeUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('private-reaction', { messageId, emoji, from: socket.username });
    }
  });


  socket.on('admin-delete-message', ({ messageId }) => {
    const u = usersDb.find(u => u.username === socket.username);
    if (!u) return;
    const msgIndex = messagesDb.findIndex(m => m.id === messageId);
    if (msgIndex !== -1) {
      const msg = messagesDb[msgIndex];
      if (u.role === 'superadmin') {
        // Can delete anything
      } else if (u.role === 'admin') {
        // Can only delete their own message
        if (msg.sender !== socket.username) return;
      } else {
        return; // normal users cannot delete
      }
      messagesDb.splice(msgIndex, 1);
      saveMessages();
      io.emit('message-deleted', { messageId });
    }
  });

  socket.on('admin-clear-chat', ({ targetUser }) => {
    const u = usersDb.find(u => u.username === socket.username);
    if (!u || u.role !== 'superadmin') return; // ONLY SUPERADMIN
    const filtered = messagesDb.filter(m => !(
      (m.sender === socket.username && m.receiver === targetUser) ||
      (m.sender === targetUser && m.receiver === socket.username)
    ));
    messagesDb.length = 0;
    messagesDb.push(...filtered);
    saveMessages();
    io.emit('chat-cleared', { targetUser });
  });

  socket.on('direct-call', (targetUsername) => {
    const targetSocketId = activeUsers.get(targetUsername);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-direct-call', socket.username);
    } else {
      socket.emit('direct-call-failed', { reason: 'User is offline' });
    }
  });

  socket.on('direct-call-response', ({ callerUsername, accept }) => {
    const callerSocketId = activeUsers.get(callerUsername);
    if (!callerSocketId) return;

    if (accept) {
      io.to(callerSocketId).emit('call-accepted', socket.username);
    } else {
      io.to(callerSocketId).emit('direct-call-failed', { reason: 'Call declined' });
    }
  });

  socket.on('join-direct-room', ({ role, partnerUsername, myUsername }) => {
    socket.username = myUsername;
    activeUsers.set(myUsername, socket.id);
    const roomId = [myUsername, partnerUsername].sort().join('_');
    socket.join(roomId);
    socket.roomId = roomId;

    const room = io.sockets.adapter.rooms.get(roomId);
    if (room && room.size === 2) {
      io.to(roomId).emit('partner-found');
      
      const partnerSocketId = activeUsers.get(partnerUsername);
      if (partnerSocketId) {
        socket.emit('partner-username', { username: partnerUsername, gender: 'Not Specified' });
        io.to(partnerSocketId).emit('partner-username', { username: socket.username, gender: socket.preferences?.myGender || 'Not Specified' });
      }

      if (role === 'caller') {
        socket.emit('initiate-offer');
      } else {
        socket.to(roomId).emit('initiate-offer');
      }
    }
  });

  socket.on('find-partner', (preferences = { myGender: 'Any', interestedIn: 'Any', username: 'Unknown' }) => {
    socket.preferences = preferences;
    socket.username = preferences.username;
    activeUsers.set(preferences.username, socket.id);
    
    // Find a compatible partner
    const matchIndex = waitingUsers.findIndex(u => {
      if (u.id === socket.id) return false;
      
      const partnerWants = u.preferences.interestedIn;
      const iAm = socket.preferences.myGender;
      const iWant = socket.preferences.interestedIn;
      const partnerIs = u.preferences.myGender;
      
      const partnerLikesMe = partnerWants === 'Any' || partnerWants === iAm || iAm === 'Any';
      const iLikePartner = iWant === 'Any' || iWant === partnerIs || partnerIs === 'Any';
      
      return partnerLikesMe && iLikePartner;
    });

    if (matchIndex !== -1) {
      const partner = waitingUsers.splice(matchIndex, 1)[0];

      const roomId = `room_${partner.id}_${socket.id}`;
      socket.join(roomId);
      partner.join(roomId);

      socket.roomId = roomId;
      partner.roomId = roomId;

      // Notify both that a partner was found
      io.to(roomId).emit('partner-found');
      
      // Exchange usernames
      socket.emit('partner-username', { username: partner.username, gender: partner.preferences.myGender || 'Not Specified' });
      partner.emit('partner-username', { username: socket.username, gender: socket.preferences.myGender || 'Not Specified' });

      // We instruct the user who was waiting to start the WebRTC connection by creating an offer
      partner.emit('initiate-offer');
    } else {
      // Ensure we don't push duplicates
      if (!waitingUsers.find(u => u.id === socket.id)) {
        waitingUsers.push(socket);
      }
    }
  });

  socket.on('offer', (offer) => {
    socket.to(socket.roomId).emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    socket.to(socket.roomId).emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate) => {
    socket.to(socket.roomId).emit('ice-candidate', candidate);
  });

  socket.on('chat-message', (msg) => {
    socket.to(socket.roomId).emit('chat-message', msg);
  });

  socket.on('chat-reaction', (data) => {
    socket.to(socket.roomId).emit('chat-reaction', data);
  });

  socket.on('blur-state-change', (isBlurred) => {
    socket.to(socket.roomId).emit('blur-state-change', isBlurred);
  });

  socket.on('report-user', (data) => {
    const { reason, partnerUsername, screenshot } = data;
    const myUsername = socket.username || 'Unknown';
    const reportedUser = partnerUsername || 'Unknown';
    
    console.log(`User ${myUsername} reported ${reportedUser} for ${reason}`);
    
    const timestamp = Date.now();
    
    let imageFilename = null;
    if (screenshot) {
      const base64Data = screenshot.replace(/^data:image\/jpeg;base64,/, "");
      imageFilename = `report_${timestamp}.jpg`;
      const imagePath = path.join(reportsDir, imageFilename);
      fs.writeFile(imagePath, base64Data, 'base64', (err) => {
        if(err) console.error("Error saving screenshot", err);
      });
    }

    const logEntry = {
       id: timestamp,
       reporter: myUsername,
       reported: reportedUser,
       reason: reason,
       time: new Date().toISOString(),
       screenshot: imageFilename
    };
    
    io.emit('admin-update');
    
    const mailOptions = {
      from: '"Coll-Connect" <' + process.env.ADMIN_EMAIL + '>',
      to: process.env.ADMIN_EMAIL,
      subject: `New User Report: ${reportedUser}`,
      text: `Hello Admin,\n\nA new report has been submitted.\n\nReporter: ${myUsername}\nReported User: ${reportedUser}\nReason: ${reason}\n\nPlease check the admin dashboard to view the screenshot and take action.`
    };
    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error("Error sending report email to admin:", error);
      } else {
        console.log(`[Email Sent] Report notification sent to admin for ${reportedUser}`);
      }
    });

    
    const logPath = path.join(reportsDir, 'reports.json');
    let logs = [];
    if (fs.existsSync(logPath)) {
      try {
        logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      } catch (e) {
        console.error("Error reading reports file", e);
      }
    }
    logs.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('partner-disconnected');
      socket.leave(roomId);
      socket.roomId = null;
    }
  });

  socket.on('skip', () => {
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('partner-disconnected');
      socket.leave(roomId);
      socket.roomId = null;
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.username && activeUsers.get(socket.username) === socket.id) {
      activeUsers.delete(socket.username);
    }
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('partner-disconnected');
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
