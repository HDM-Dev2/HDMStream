const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    default: 'Unnamed Room'
  },
  cameras: [{
    socketId: String,
    deviceId: String,
    joinedAt: { type: Date, default: Date.now }
  }],
  receivers: [{
    socketId: String,
    deviceId: String,
    joinedAt: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'closed'],
    default: 'active'
  },
  maxCameras: {
    type: Number,
    default: 10
  },
  maxReceivers: {
    type: Number,
    default: 50
  },
  metadata: {
    type: Map,
    of: String,
    default: {}
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
roomSchema.index({ roomId: 1, status: 1 });
roomSchema.index({ lastActivity: -1 });

// Update lastActivity
roomSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Check if room is empty
roomSchema.methods.isEmpty = function() {
  return this.cameras.length === 0 && this.receivers.length === 0;
};

// Add camera
roomSchema.methods.addCamera = function(socketId, deviceId = null) {
  this.cameras.push({ socketId, deviceId });
  return this.save();
};

// Add receiver
roomSchema.methods.addReceiver = function(socketId, deviceId = null) {
  this.receivers.push({ socketId, deviceId });
  return this.save();
};

// Remove camera
roomSchema.methods.removeCamera = function(socketId) {
  this.cameras = this.cameras.filter(c => c.socketId !== socketId);
  return this.save();
};

// Remove receiver
roomSchema.methods.removeReceiver = function(socketId) {
  this.receivers = this.receivers.filter(r => r.socketId !== socketId);
  return this.save();
};

module.exports = mongoose.model('Room', roomSchema);