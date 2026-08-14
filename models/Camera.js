const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    default: 'Unknown Camera'
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'streaming', 'stopped'],
    default: 'offline'
  },
  socketId: {
    type: String,
    default: null
  },
  facingMode: {
    type: String,
    enum: ['front', 'back', 'environment', 'user'],
    default: 'environment'
  },
  resolution: {
    width: { type: Number, default: 1280 },
    height: { type: Number, default: 720 }
  },
  metadata: {
    type: Map,
    of: String,
    default: {}
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update lastActive on save
cameraSchema.pre('save', function(next) {
  this.lastActive = new Date();
  next();
});

module.exports = mongoose.model('Camera', cameraSchema);