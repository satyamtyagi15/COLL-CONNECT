const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const User = require('../models/User');

const isSuperAdmin = async (req, res, next) => {
  if (!req.user) return res.status(403).json({ error: 'Forbidden' });
  try {
    const user = await User.findOne({ username: req.user.username });
    if (user && user.role === 'superadmin') {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { authenticate, isSuperAdmin };
