const mongoose = require('mongoose');

const scanGroupSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  photos: [{
    cloudinaryUrl: String,
    cloudinaryPublicId: String,
    lat: Number,
    lng: Number,
    marked: {
      type: Boolean,
      default: false
    },
    timestamp: Date
  }],
  totalPhotos: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number,
    default: 0
  },
  startedAt: Date,
  endedAt: Date,
  sentToFarmvexa: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

scanGroupSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ScanGroup', scanGroupSchema);