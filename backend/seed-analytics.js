require('dotenv').config();
const mongoose = require('mongoose');
const Analytics = require('./models/Analytics');

mongoose.connect((process.env.MONGO_URI || '').trim()).then(async () => {
  await Analytics.deleteMany({});
  const data = [];
  for(let i=6; i>=0; i--) {
    data.push({ timestamp: new Date(Date.now() - i*3600000), count: Math.floor(Math.random() * 20) + 5 });
  }
  await Analytics.insertMany(data);
  console.log('Dummy data inserted');
  process.exit(0);
});
