const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://coll_connect_user:Lordknight2656@cluster0.xraj5tx.mongodb.net/coll_connect?retryWrites=true&w=majority&appName=Cluster0')
  .then(async () => {
    const User = require('./backend/models/User');
    const users = await User.find({ username: { $regex: 'user', $options: 'i' } });
    console.log(JSON.stringify(users.map(u => ({ username: u.username, role: u.role, _id: u._id })), null, 2));
    mongoose.disconnect();
  })
  .catch(console.error);
