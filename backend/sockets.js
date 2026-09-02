const { cloudinary } = require('./config/cloudinary');
const User = require('./models/User');
const Message = require('./models/Message');
const Report = require('./models/Report');

const activeUsers = new Map();
let waitingUsers = [];

module.exports = (io) => {
  io.activeUsers = activeUsers;
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register-active', async (username) => {
      const u = await User.findOne({ username: new RegExp('^' + String(username).trim() + '$', 'i') });
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

    socket.on('private-message', async ({ id, to, text, type = 'text', fileUrl, isTimeCapsule, deliverAt }) => {
      if (!socket.username) return;

      const senderUser = await User.findOne({ username: new RegExp('^' + String(socket.username).trim() + '$', 'i') });
      const receiverUser = await User.findOne({ username: new RegExp('^' + String(to).trim() + '$', 'i') });

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
        if (!isSenderAdmin && !isReceiverAdmin && !areFriends) {
          socket.emit('chat-error', { message: 'You can only chat with your friends.' });
          return;
        }
      }

      const msg = new Message({
        sender: socket.username,
        receiver: to,
        text: text,
        type: type,
        fileUrl: fileUrl,
        timestamp: new Date(),
        isTimeCapsule: isTimeCapsule === true || isTimeCapsule === 'true',
        deliverAt: deliverAt ? new Date(deliverAt) : null
      });
      await msg.save();

      const msgData = {
        id: msg._id.toString(),
        sender: socket.username,
        receiver: to,
        text: text,
        type: type,
        fileUrl: fileUrl,
        timestamp: msg.timestamp,
        isTimeCapsule: msg.isTimeCapsule,
        deliverAt: msg.deliverAt
      };

      const targetSocketId = activeUsers.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('private-message', msgData);
      }
      socket.emit('message-sent-ack', { tempId: id, realId: msgData.id });
    });

    socket.on('private-reaction', ({ messageId, to, emoji }) => {
      if (!socket.username) return;
      const targetSocketId = activeUsers.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('private-reaction', { messageId, emoji, from: socket.username });
      }
    });

    socket.on('admin-delete-message', async ({ messageId }) => {
      const u = await User.findOne({ username: new RegExp('^' + String(socket.username).trim() + '$', 'i') });
      if (!u) return;
      const msg = await Message.findById(messageId);
      if (!msg) return;

      if (u.role === 'superadmin') {
        // Can delete anything
      } else if (u.role === 'admin') {
        if (msg.sender !== socket.username) return; // Admin can only delete their own
      } else {
        return; // Normal users cannot delete
      }
      if (msg.fileUrl && msg.fileUrl.includes('cloudinary.com')) {
        try {
          const parts = msg.fileUrl.split('/');
          const filename = parts.pop().split('.')[0];
          const folder = parts.pop();
          const publicId = `${folder}/${filename}`;
          const resourceType = msg.type === 'video' || msg.type === 'audio' ? 'video' : 'image';
          await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        } catch(e) { console.error('Cloudinary delete error:', e); }
      }
      await Message.findByIdAndDelete(messageId);
      io.emit('message-deleted', { messageId });
    });

    socket.on('admin-clear-chat', async ({ targetUser }) => {
      const u = await User.findOne({ username: new RegExp('^' + String(socket.username).trim() + '$', 'i') });
      if (!u || u.role !== 'superadmin') return; 
      
      const query = {
        $or: [
          { sender: socket.username, receiver: targetUser },
          { sender: targetUser, receiver: socket.username }
        ]
      };
      
      const oldMessages = await Message.find(query);
      for (const msg of oldMessages) {
        if (msg.fileUrl && msg.fileUrl.includes('cloudinary.com')) {
          try {
            const parts = msg.fileUrl.split('/');
            const filename = parts.pop().split('.')[0];
            const folder = parts.pop();
            const publicId = `${folder}/${filename}`;
            const resourceType = msg.type === 'video' || msg.type === 'audio' ? 'video' : 'image';
            await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
          } catch(e) { console.error('Cloudinary delete error:', e); }
        }
      }

      await Message.deleteMany(query);
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

    socket.on('join-direct-room', async ({ role, partnerUsername, myUsername }) => {
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
          const u1 = await User.findOne({ username: new RegExp('^' + String(socket.username).trim() + '$', 'i') });
          const u2 = await User.findOne({ username: new RegExp('^' + String(partnerUsername).trim() + '$', 'i') });
          const role1 = u1 ? u1.role : 'user';
          const role2 = u2 ? u2.role : 'user';
          console.log('[join-direct-room] Roles fetched from DB:', socket.username, '=', role1, '|', partnerUsername, '=', role2);

          socket.emit('partner-username', { username: partnerUsername, gender: 'Not Specified', role: role2 });
          io.to(partnerSocketId).emit('partner-username', { username: socket.username, gender: socket.preferences?.myGender || 'Not Specified', role: role1 });
        }

        if (role === 'caller') {
          socket.emit('initiate-offer');
        } else {
          socket.to(roomId).emit('initiate-offer');
        }
      }
    });

    socket.on('find-partner', async (preferences = { myGender: 'Any', interestedIn: 'Any', username: 'Unknown' }) => {
      socket.preferences = preferences;
      socket.username = preferences.username;
      activeUsers.set(preferences.username, socket.id);
      
      const matchIndex = waitingUsers.findIndex(u => {
        if (u.id === socket.id) return false;
        
        const partnerWants = String(u.preferences.interestedIn || 'Any').toLowerCase();
        const iAm = String(socket.preferences.myGender || 'Any').toLowerCase();
        const iWant = String(socket.preferences.interestedIn || 'Any').toLowerCase();
        const partnerIs = String(u.preferences.myGender || 'Any').toLowerCase();
        
        let partnerLikesMe = partnerWants === 'any' || partnerWants === iAm || iAm === 'any';
        let iLikePartner = iWant === 'any' || iWant === partnerIs || partnerIs === 'any';
        
        // Owner Requirement: "Any gender preference users should connect with ALL types of preference users"
        // This makes 'Any' preference act as a universal wildcard that bypasses the other person's strict filters.
        if (iWant === 'any') partnerLikesMe = true;
        if (partnerWants === 'any') iLikePartner = true;
        
        return partnerLikesMe && iLikePartner;
      });

      if (matchIndex !== -1) {
        const partner = waitingUsers.splice(matchIndex, 1)[0];

        const u1 = await User.findOne({ username: new RegExp('^' + String(socket.username).trim() + '$', 'i') });
        const u2 = await User.findOne({ username: new RegExp('^' + String(partner.username).trim() + '$', 'i') });
        const role1 = u1 ? u1.role : 'user';
        const role2 = u2 ? u2.role : 'user';
        console.log('[find-partner] DB lookup:', socket.username, '=> u1:', u1 ? u1.username + '/' + u1.role : 'NOT FOUND', '|', partner.username, '=> u2:', u2 ? u2.username + '/' + u2.role : 'NOT FOUND');

        const roomId = `room_${partner.id}_${socket.id}`;
        socket.join(roomId);
        partner.join(roomId);

        socket.roomId = roomId;
        partner.roomId = roomId;

        io.to(roomId).emit('partner-found');
        socket.emit('partner-username', { username: partner.username, gender: partner.preferences.myGender || 'Not Specified', role: role2 });
        partner.emit('partner-username', { username: socket.username, gender: socket.preferences.myGender || 'Not Specified', role: role1 });
        console.log('[find-partner] Emitted roles:', 'to', socket.username, '=> role:', role2, '| to', partner.username, '=> role:', role1);

        partner.emit('initiate-offer');
      } else {
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

    socket.on('report-user', async (data) => {
      const { reason, partnerUsername, screenshot } = data;
      const myUsername = socket.username || 'Unknown';
      const reportedUser = partnerUsername || 'Unknown';
      
      console.log(`User ${myUsername} reported ${reportedUser} for ${reason}`);
      
      let screenshotUrl = null;
      if (screenshot) {
        try {
          const uploadRes = await cloudinary.uploader.upload(screenshot, { folder: 'omegle-reports' });
          screenshotUrl = uploadRes.secure_url;
        } catch(e) {
          console.error("Cloudinary upload failed for report", e);
        }
      }

      const report = new Report({
        reporter: myUsername,
        reportedUser: reportedUser,
        reason: reason,
        screenshot: screenshotUrl,
        timestamp: new Date()
      });
      await report.save();
      
      io.emit('admin-update');
      
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
};
