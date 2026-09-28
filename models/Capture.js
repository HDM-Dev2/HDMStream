const mongoose = require('mongoose');

const captureSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['photo', 'video'],
    required: true
  },
  cloudinaryUrl: {
    type: String,
    required: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true
  },
  senderName: String,
  receiverName: String,
  size: Number,
  format: String,
  scanMode: {
    type: Boolean,
    default: false
  },
  gps: {
    lat: Number,
    lng: Number,
    accuracy: Number,
    altitude: Number
  },
  farmvexaContext: {
    farmId: String,
    farmName: String
  }
}, {
  timestamps: true
});

captureSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Capture', captureSchema);