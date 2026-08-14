const Camera = require('../models/Camera');
const Room = require('../models/Room');

const activeSenders = new Map();
const activeReceivers = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);
    
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
        
        await Camera.findOneAndUpdate(
          { deviceId },
          { 
            status: 'online',
            socketId: socket.id,
            name,
            lastActive: new Date()
          },
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
        
        console.log(`📤 Sender joined: ${socket.id} (${name})`);
      } catch (error) {
        console.error('Sender join error:', error);
      }
    });
    
    socket.on('sender-stop', async () => {
      try {
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
      } catch (error) {
        console.error('Sender stop error:', error);
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
        
        io.emit('receivers-update', Array.from(activeReceivers.values()));
        
        activeSenders.forEach((sender, senderSocketId) => {
          socket.emit('sender-available', {
            senderId: senderSocketId,
            deviceId: sender.deviceId,
            name: sender.name
          });
        });
        
        console.log(`📥 Receiver joined: ${socket.id} (${name})`);
      } catch (error) {
        console.error('Receiver join error:', error);
      }
    });
    
    socket.on('sender-target', (data) => {
      console.log('🎯 Sender targeting receiver:', data);
      if (data.receiverId) {
        io.to(data.receiverId).emit('sender-target', {
          senderId: data.senderId || socket.id,
          deviceId: data.deviceId,
          name: data.name
        });
      }
    });
    
    socket.on('offer', (data) => {
      console.log('📨 Offer from:', socket.id, 'to:', data.target);
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
      console.log('📨 Answer from:', socket.id, 'to:', data.target);
      if (data.target) {
        io.to(data.target).emit('answer', {
          answer: data.answer,
          from: socket.id,
          fromDeviceId: socket.deviceId,
          fromName: socket.name
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
      console.log(`🔌 Disconnected: ${socket.id}`);
      
      try {
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
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    });
  });
};