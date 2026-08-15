const ScanGroup = require('../models/ScanGroup');
const cloudinary = require('../config/cloudinary');

exports.getScans = async (req, res) => {
  try {
    const scans = await ScanGroup.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      scans: scans.map(s => ({
        id: s._id,
        photos: s.photos,
        totalPhotos: s.totalPhotos,
        duration: s.duration,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        sentToFarmvexa: s.sentToFarmvexa,
        createdAt: s.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get scans' });
  }
};

exports.saveScan = async (req, res) => {
  try {
    const { photos, totalPhotos, duration, startedAt, endedAt } = req.body;
    
    if (!photos || photos.length === 0) {
      return res.status(400).json({ error: 'No photos in scan' });
    }
    
    const scan = await ScanGroup.create({
      userId: req.userId,
      photos: photos.map(p => ({
        cloudinaryUrl: p.url,
        cloudinaryPublicId: p.cloudinaryPublicId,
        lat: p.lat,
        lng: p.lng,
        timestamp: p.timestamp || new Date()
      })),
      totalPhotos: totalPhotos || photos.length,
      duration: duration || 0,
      startedAt: startedAt || new Date(),
      endedAt: endedAt || new Date(),
      sentToFarmvexa: true
    });
    
    res.status(201).json({
      success: true,
      scan: {
        id: scan._id,
        totalPhotos: scan.totalPhotos,
        duration: scan.duration
      }
    });
  } catch (error) {
    console.error('Save scan error:', error);
    res.status(500).json({ error: 'Failed to save scan' });
  }
};

exports.deleteScan = async (req, res) => {
  try {
    const scan = await ScanGroup.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });
    
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    for (const photo of scan.photos) {
      if (photo.cloudinaryPublicId) {
        await cloudinary.uploader.destroy(photo.cloudinaryPublicId);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete scan' });
  }
};

exports.deletePhoto = async (req, res) => {
  try {
    const scan = await ScanGroup.findOne({
      _id: req.params.id,
      userId: req.userId
    });
    
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    const photo = scan.photos.id(req.params.photoId);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    if (photo.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(photo.cloudinaryPublicId);
    }
    
    photo.remove();
    scan.totalPhotos = scan.photos.length;
    await scan.save();
    
    res.json({ success: true, totalPhotos: scan.totalPhotos });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo' });
  }
};

exports.toggleMarkPhoto = async (req, res) => {
  try {
    const scan = await ScanGroup.findOne({
      _id: req.params.id,
      userId: req.userId
    });
    
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    const photo = scan.photos.id(req.params.photoId);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    photo.marked = !photo.marked;
    await scan.save();
    
    res.json({ success: true, marked: photo.marked });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark photo' });
  }
};

exports.markAllPhotos = async (req, res) => {
  try {
    const scan = await ScanGroup.findOne({
      _id: req.params.id,
      userId: req.userId
    });
    
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    const allMarked = scan.photos.every(p => p.marked);
    scan.photos.forEach(p => p.marked = !allMarked);
    await scan.save();
    
    res.json({ success: true, allMarked: !allMarked });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all' });
  }
};

exports.bulkDeleteMarked = async (req, res) => {
  try {
    const scan = await ScanGroup.findOne({
      _id: req.params.id,
      userId: req.userId
    });
    
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    
    const markedPhotos = scan.photos.filter(p => p.marked);
    
    for (const photo of markedPhotos) {
      if (photo.cloudinaryPublicId) {
        await cloudinary.uploader.destroy(photo.cloudinaryPublicId);
      }
      photo.remove();
    }
    
    scan.totalPhotos = scan.photos.length;
    await scan.save();
    
    res.json({ success: true, deletedCount: markedPhotos.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete marked photos' });
  }
};