require('dotenv').config();
require('./config/env');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Connect to MongoDB
mongoose.connect((process.env.MONGO_URI || '').trim())
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// We will attach io to req so routes can use it
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Import Routes
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/friends'));
app.use('/api', require('./routes/profile'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/support'));
app.use('/api', require('./routes/announcements'));
app.use('/api', require('./routes/chat'));
app.use('/api', require('./routes/upload'));
app.use('/api', require('./routes/whisper'));

// Socket logic
require('./sockets')(io);

// Analytics & Chat Auto-Cleanup Job - Run every 1 hour (3,600,000 ms)
const Analytics = require('./models/Analytics');
const Message = require('./models/Message');
const { cloudinary } = require('./config/cloudinary');
setInterval(async () => {
  try {
    const activeCount = io.activeUsers ? io.activeUsers.size : 0;
    
    // Save current active users count
    const record = new Analytics({ count: activeCount });
    await record.save();
    
    // Delete analytics records older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await Analytics.deleteMany({ timestamp: { $lt: sevenDaysAgo } });

    // Chat Auto-Cleanup: Delete messages older than 7 days
    const oldMessages = await Message.find({ timestamp: { $lt: sevenDaysAgo } });
    let deletedMediaCount = 0;
    for (const msg of oldMessages) {
      if (msg.fileUrl && msg.fileUrl.includes('cloudinary.com')) {
        try {
          const parts = msg.fileUrl.split('/');
          const filename = parts.pop().split('.')[0];
          const folder = parts.pop();
          const publicId = `${folder}/${filename}`;
          const resourceType = msg.type === 'video' || msg.type === 'audio' ? 'video' : 'image';
          await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
          deletedMediaCount++;
        } catch (err) {
          console.error('Error deleting media from cloudinary in auto-cleanup:', err);
        }
      }
    }
    await Message.deleteMany({ timestamp: { $lt: sevenDaysAgo } });
    if (oldMessages.length > 0) {
      io.emit('chat-cleared', { targetUser: 'auto-cleanup' }); // Trigger clients to refresh if needed
    }
    
    console.log(`[Analytics & Auto-Cleanup] Logged ${activeCount} active users. Cleaned up ${oldMessages.length} old messages and ${deletedMediaCount} media files.`);
  } catch (err) {
    console.error('[Background Job Error]:', err);
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

// touch
// retry connect