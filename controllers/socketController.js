const jwt = require('jsonwebtoken');
const Camera = require('../models/Camera');
const Device = require('../models/Device');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'hdm-stream-secret';

const activeSenders = new Map();
const activeReceivers = new Map();

module.exports = (io) => {
  
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      socket.authProvider = decoded.authProvider;
      socket.farmvexaId = decoded.farmvexaId;
      
      next();
    } catch (error) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    
    socket.on('sender-join', async (data = {}) => {
      try {
        const { deviceId = socket.id, name } = data;
        const user = await User.findById(socket.userId);
        
        socket.role = 'sender';
        socket.deviceId = deviceId;
        socket.name = name || user?.deviceName || `Camera-${socket.id.slice(0, 4)}`;
        
        activeSenders.set(socket.id, {
          socketId: socket.id,
          deviceId,
          name: socket.name,
          userId: socket.userId,
          userEmail: socket.userEmail,
          authProvider: socket.authProvider,
          joinedAt: Date.now()
        });
        
        await Device.findOneAndUpdate(
          { deviceId, userId: socket.userId, type: 'sender' },
          { name: socket.name, lastSeen: new Date(), userId: socket.userId },
          { upsert: true, new: true }
        );
        
        io.emit('senders-update', Array.from(activeSenders.values()).map(s => ({
          socketId: s.socketId,
          deviceId: s.deviceId,
          name: s.name,
          userId: s.userId,
          userEmail: s.userEmail,
          authProvider: s.authProvider
        })));
        
        activeReceivers.forEach((receiver, receiverSocketId) => {
          if (receiver.userId === socket.userId) {
            io.to(receiverSocketId).emit('sender-available', {
              senderId: socket.id,
              deviceId,
              name: socket.name,
              userId: socket.userId
            });
          }
        });
      } catch (error) {
        console.error('Sender join error:', error);
      }
    });

    socket.on('receiver-join', async (data = {}) => {
      try {
        const { deviceId = socket.id, name } = data;
        const user = await User.findById(socket.userId);
        
        socket.role = 'receiver';
        socket.deviceId = deviceId;
        socket.name = name || user?.deviceName || `Receiver-${socket.id.slice(0, 4)}`;
        
        activeReceivers.set(socket.id, {
          socketId: socket.id,
          deviceId,
          name: socket.name,
          userId: socket.userId,
          userEmail: socket.userEmail,
          authProvider: socket.authProvider,
          joinedAt: Date.now()
        });
        
        await Device.findOneAndUpdate(
          { deviceId, userId: socket.userId, type: 'receiver' },
          { name: socket.name, lastSeen: new Date(), userId: socket.userId },
          { upsert: true, new: true }
        );
        
        io.emit('receivers-update', Array.from(activeReceivers.values()).map(r => ({
          socketId: r.socketId,
          deviceId: r.deviceId,
          name: r.name,
          userId: r.userId,
          userEmail: r.userEmail,
          authProvider: r.authProvider
        })));
        
        activeSenders.forEach((sender, senderSocketId) => {
          if (sender.userId === socket.userId) {
            socket.emit('sender-available', {
              senderId: senderSocketId,
              deviceId: sender.deviceId,
              name: sender.name,
              userId: sender.userId
            });
          }
        });
      } catch (error) {
        console.error('Receiver join error:', error);
      }
    });

    socket.on('frame', (data) => {
      const { frameData, receiverId, senderName } = data;
      const receiver = activeReceivers.get(receiverId);
      if (receiver && receiver.userId === socket.userId) {
        io.to(receiverId).emit('frame', {
          frameData,
          senderId: socket.id,
          senderName: senderName || socket.name || 'Unknown',
          userId: socket.userId
        });
      }
    });

    socket.on('frame-broadcast', (data) => {
      const { frameData, senderName } = data;
      activeReceivers.forEach((receiver, receiverSocketId) => {
        if (receiver.userId === socket.userId) {
          io.to(receiverSocketId).emit('frame', {
            frameData,
            senderId: socket.id,
            senderName: senderName || socket.name || 'Unknown',
            userId: socket.userId
          });
        }
      });
    });

    socket.on('scan-started', (data) => {
      activeReceivers.forEach((receiver, receiverSocketId) => {
        if (receiver.userId === socket.userId) {
          io.to(receiverSocketId).emit('scan-started', {
            senderId: socket.id,
            senderName: socket.name,
            settings: data.settings
          });
        }
      });
    });

    socket.on('scan-photo-captured', (data) => {
      activeReceivers.forEach((receiver, receiverSocketId) => {
        if (receiver.userId === socket.userId) {
          io.to(receiverSocketId).emit('scan-photo-captured', {
            senderId: socket.id,
            count: data.count,
            total: data.total,
            photo: data.photo
          });
        }
      });
    });

    socket.on('scan-stopped', (data) => {
      activeReceivers.forEach((receiver, receiverSocketId) => {
        if (receiver.userId === socket.userId) {
          io.to(receiverSocketId).emit('scan-stopped', {
            senderId: socket.id,
            totalPhotos: data.totalPhotos,
            photos: data.photos,
            settings: data.settings,
            duration: data.duration
          });
        }
      });
    });

    socket.on('sender-stop', async () => {
      if (socket.role === 'sender') {
        activeSenders.delete(socket.id);
        if (socket.deviceId) {
          await Camera.findOneAndUpdate(
            { deviceId: socket.deviceId },
            { status: 'offline', socketId: null, lastActive: new Date() }
          );
        }
        io.emit('senders-update', Array.from(activeSenders.values()).map(s => ({
          socketId: s.socketId,
          name: s.name,
          userId: s.userId
        })));
        io.emit('sender-disconnected', socket.id);
      }
    });

    socket.on('disconnect', async () => {
      if (socket.role === 'sender') {
        activeSenders.delete(socket.id);
        io.emit('senders-update', Array.from(activeSenders.values()).map(s => ({
          socketId: s.socketId,
          name: s.name,
          userId: s.userId
        })));
        io.emit('sender-disconnected', socket.id);
      }
      if (socket.role === 'receiver') {
        activeReceivers.delete(socket.id);
        io.emit('receivers-update', Array.from(activeReceivers.values()).map(r => ({
          socketId: r.socketId,
          name: r.name,
          userId: r.userId
        })));
        io.emit('receiver-disconnected', socket.id);
      }
    });
  });
};