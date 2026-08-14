const Capture = require('../models/Capture');

exports.getCaptures = async (req, res) => {
  try {
    const captures = await Capture.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(200);
    
    res.json({
      success: true,
      captures: captures.map(c => ({
        id: c._id,
        type: c.type,
        cloudinaryUrl: c.cloudinaryUrl,
        cloudinaryPublicId: c.cloudinaryPublicId,
        senderName: c.senderName,
        receiverName: c.receiverName,
        createdAt: c.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get captures' });
  }
};

exports.saveCapture = async (req, res) => {
  try {
    const { cloudinaryUrl, cloudinaryPublicId, type, senderName, receiverName } = req.body;
    
    if (!cloudinaryUrl || !cloudinaryPublicId) {
      return res.status(400).json({ error: 'Cloudinary data required' });
    }
    
    const capture = await Capture.create({
      userId: req.userId,
      cloudinaryUrl,
      cloudinaryPublicId,
      type: type || 'photo',
      senderName,
      receiverName
    });
    
    res.status(201).json({
      success: true,
      capture: {
        id: capture._id,
        cloudinaryUrl: capture.cloudinaryUrl,
        cloudinaryPublicId: capture.cloudinaryPublicId,
        type: capture.type,
        createdAt: capture.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save capture' });
  }
};

exports.deleteCapture = async (req, res) => {
  try {
    const capture = await Capture.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });
    
    if (!capture) {
      return res.status(404).json({ error: 'Capture not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete capture' });
  }
};