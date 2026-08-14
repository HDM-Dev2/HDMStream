const cloudinary = require('../config/cloudinary');
const Capture = require('../models/Capture');

exports.uploadImage = async (req, res) => {
  try {
    const { dataUrl, senderName, receiverName, gps, scanMode } = req.body;
    
    if (!dataUrl) {
      return res.status(400).json({ error: 'dataUrl is required' });
    }
    
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: 'hdm-stream',
      resource_type: 'image',
      transformation: [
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ],
      secure: true
    });
    
    const capture = await Capture.create({
      userId: req.userId,
      cloudinaryUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      type: 'photo',
      senderName,
      receiverName,
      scanMode: scanMode || false,
      gps: gps || undefined
    });
    
    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      captureId: capture._id
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    const { publicId, captureId } = req.body;
    
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
    }
    
    if (captureId) {
      await Capture.findOneAndDelete({
        _id: captureId,
        userId: req.userId
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
};