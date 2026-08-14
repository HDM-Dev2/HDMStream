const Camera = require('../models/Camera');
const Room = require('../models/Room');
const Device = require('../models/Device');

const activeSenders = new Map();
const activeReceivers = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    
    socket.on('sender-join', async (data = {}) => {
      try {
        const { deviceId = socket.id, name = 'Camera' } = data;
        
        socket.role = 'sender';
        socket.deviceId = deviceId;
        socket.name = name;
        
        activeSenders.set(socket.id, {
          socketId: socket.id,
          deviceId,
          name,
          joinedAt: Date.now()
        });
        
        await Device.findOneAndUpdate(
          { deviceId, type: 'sender' },
          { name, lastSeen: new Date() },
          { upsert: true, new: true }
        );
        
        await Camera.findOneAndUpdate(
          { deviceId },
          { status: 'online', socketId: socket.id, name, lastActive: new Date() },
          { upsert: true, new: true }
        );
        
        io.emit('senders-update', Array.from(activeSenders.values()));
        
        activeReceivers.forEach((receiver, receiverSocketId) => {
          io.to(receiverSocketId).emit('sender-available', {
            senderId: socket.id,
            deviceId,
            name
          });
        });
      } catch (error) {
        console.error('Sender join error:', error);
      }
    });

    socket.on('receiver-join', async (data = {}) => {
      try {
        const { deviceId = socket.id, name = 'Receiver' } = data;
        
        socket.role = 'receiver';
        socket.deviceId = deviceId;
        socket.name = name;
        
        activeReceivers.set(socket.id, {
          socketId: socket.id,
          deviceId,
          name,
          joinedAt: Date.now()
        });
        
        await Device.findOneAndUpdate(
          { deviceId, type: 'receiver' },
          { name, lastSeen: new Date() },
          { upsert: true, new: true }
        );
        
        io.emit('receivers-update', Array.from(activeReceivers.values()));
        
        activeSenders.forEach((sender, senderSocketId) => {
          socket.emit('sender-available', {
            senderId: senderSocketId,
            deviceId: sender.deviceId,
            name: sender.name
          });
        });
      } catch (error) {
        console.error('Receiver join error:', error);
      }
    });

    socket.on('get-device-name', async (data) => {
      try {
        const { deviceId, type } = data;
        const device = await Device.findOne({ deviceId, type });
        socket.emit('device-name-found', device ? { name: device.name } : { name: null });
      } catch (error) {
        socket.emit('device-name-found', { name: null });
      }
    });

    socket.on('register-device', async (data) => {
      try {
        const { deviceId, name, type } = data;
        await Device.findOneAndUpdate(
          { deviceId, type },
          { name, lastSeen: new Date() },
          { upsert: true, new: true }
        );
        socket.emit('device-registered', { success: true, name });
      } catch (error) {
        socket.emit('device-registered', { success: false });
      }
    });

    socket.on('frame', (data) => {
      const { frameData, receiverId, senderName } = data;
      if (receiverId && activeReceivers.has(receiverId)) {
        io.to(receiverId).emit('frame', {
          frameData,
          senderId: socket.id,
          senderName: senderName || socket.name || 'Unknown'
        });
      }
    });

    socket.on('frame-broadcast', (data) => {
      const { frameData, senderName } = data;
      activeReceivers.forEach((receiver, receiverSocketId) => {
        io.to(receiverSocketId).emit('frame', {
          frameData,
          senderId: socket.id,
          senderName: senderName || socket.name || 'Unknown'
        });
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
        io.emit('senders-update', Array.from(activeSenders.values()));
        io.emit('sender-disconnected', socket.id);
      }
    });

    socket.on('offer', (data) => {
      if (data.target) {
        io.to(data.target).emit('offer', {
          offer: data.offer,
          from: socket.id,
          fromDeviceId: socket.deviceId,
          fromName: socket.name
        });
      }
    });

    socket.on('answer', (data) => {
      if (data.target) {
        io.to(data.target).emit('answer', {
          answer: data.answer,
          from: socket.id
        });
      }
    });

    socket.on('ice-candidate', (data) => {
      if (data.target) {
        io.to(data.target).emit('ice-candidate', {
          candidate: data.candidate,
          from: socket.id
        });
      }
    });

    socket.on('disconnect', async () => {
      if (socket.role === 'sender') {
        activeSenders.delete(socket.id);
        if (socket.deviceId) {
          await Camera.findOneAndUpdate(
            { deviceId: socket.deviceId },
            { status: 'offline', socketId: null, lastActive: new Date() }
          );
        }
        io.emit('senders-update', Array.from(activeSenders.values()));
        io.emit('sender-disconnected', socket.id);
      }
      if (socket.role === 'receiver') {
        activeReceivers.delete(socket.id);
        io.emit('receivers-update', Array.from(activeReceivers.values()));
        io.emit('receiver-disconnected', socket.id);
      }
    });
  });
};