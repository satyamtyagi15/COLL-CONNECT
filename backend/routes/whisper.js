const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Whisper = require('../models/Whisper');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
};

// Get all whispers (with search filtering)
router.get('/whispers', authMiddleware, async (req, res) => {
  try {
    const dbUser = await User.findOne({ username: new RegExp('^' + req.user.username + '$', 'i') });
    const { search } = req.query;
    let query = {};
    
    if (search && search.trim() !== '') {
      query.targetUser = new RegExp(search.trim(), 'i');
    }
    
    const whispers = await Whisper.find(query).sort({ timestamp: -1 });
    
    // Fetch target user profiles to attach "ID Card" data
    const enhancedWhispers = await Promise.all(whispers.map(async (w) => {
      let whisperObj = w.toObject();
      
      // Get target user details
      const target = await User.findOne({ username: new RegExp('^' + w.targetUser + '$', 'i') });
      if (target) {
        whisperObj.targetUserDetails = {
          username: target.username,
          profilePic: target.profilePic,
          bannerImage: target.bannerImage,
          role: target.role
        };
      }
      
      // Handle Anonymity
      if (w.isAnonymous) {
        whisperObj.isAnonymous = true;
        // Superadmin and Premium users can reveal
        if (dbUser && (dbUser.role === 'superadmin' || dbUser.isPremium)) {
          whisperObj.authorDisplay = 'Secret Admirer';
          whisperObj.realAuthor = w.author; // Send real author for superadmin/premium to reveal
        } else {
          whisperObj.authorDisplay = 'Secret Admirer';
          // Do NOT send the real author to the frontend unless superadmin
          delete whisperObj.author;
          delete whisperObj.realAuthor;
        }
      } else {
        whisperObj.isAnonymous = false;
        whisperObj.authorDisplay = w.author;
      }
      
      return whisperObj;
    }));
    
    res.json(enhancedWhispers);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Post a whisper
router.post('/whispers', authMiddleware, async (req, res) => {
  try {
    const { targetUser, content, isAnonymous } = req.body;
    
    if (!targetUser || !content) {
      return res.status(400).json({ error: 'Target user and content are required' });
    }
    
    // Check if target user exists
    const userExists = await User.findOne({ username: new RegExp('^' + targetUser.trim() + '$', 'i') });
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const whisper = new Whisper({
      author: req.user.username,
      targetUser: userExists.username,
      content,
      isAnonymous: Boolean(isAnonymous)
    });
    
    await whisper.save();
    
    // Emit event if socket is available so the board updates in real time
    if (req.io) {
      req.io.emit('new-whisper');
    }
    
    res.status(201).json({ success: true, whisper });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a whisper (Superadmin only)
router.delete('/whispers/:id', authMiddleware, async (req, res) => {
  try {
    const dbUser = await User.findOne({ username: new RegExp('^' + req.user.username + '$', 'i') });
    if (!dbUser || dbUser.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    await Whisper.findByIdAndDelete(req.params.id);
    
    if (req.io) {
      req.io.emit('new-whisper'); // Reusing this event to trigger a refresh
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
