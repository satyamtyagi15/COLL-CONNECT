require('dotenv').config();
const mongoose = require('mongoose');
const Analytics = require('./models/Analytics');

mongoose.connect((process.env.MONGO_URI || '').trim()).then(async () => {
  await Analytics.deleteMany({});
  console.log('Analytics data cleared');
  process.exit(0);
});
