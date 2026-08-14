const Camera = require('../models/Camera');
const Room = require('../models/Room');

// @desc    Register a camera
// @route   POST /api/camera/register
// @access  Public
exports.registerCamera = async (req, res) => {
  try {
    const { deviceId, name, facingMode, resolution } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    
    let camera = await Camera.findOne({ deviceId });
    
    if (camera) {
      // Update existing camera
      camera.name = name || camera.name;
      camera.facingMode = facingMode || camera.facingMode;
      camera.resolution = resolution || camera.resolution;
      camera.status = 'online';
      await camera.save();
    } else {
      // Create new camera
      camera = await Camera.create({
        deviceId,
        name,
        facingMode,
        resolution,
        status: 'online'
      });
    }
    
    res.json({
      success: true,
      camera
    });
  } catch (error) {
    console.error('Register camera error:', error);
    res.status(500).json({ error: 'Failed to register camera' });
  }
};

// @desc    Get all cameras
// @route   GET /api/camera
// @access  Public
exports.getAllCameras = async (req, res) => {
  try {
    const cameras = await Camera.find().sort({ lastActive: -1 });
    
    res.json({
      success: true,
      count: cameras.length,
      cameras
    });
  } catch (error) {
    console.error('Get cameras error:', error);
    res.status(500).json({ error: 'Failed to get cameras' });
  }
};

// @desc    Get online cameras
// @route   GET /api/camera/online
// @access  Public
exports.getOnlineCameras = async (req, res) => {
  try {
    const cameras = await Camera.find({ 
      status: { $in: ['online', 'streaming'] },
      lastActive: { $gte: new Date(Date.now() - 30000) } // Active in last 30 seconds
    });
    
    res.json({
      success: true,
      count: cameras.length,
      cameras
    });
  } catch (error) {
    console.error('Get online cameras error:', error);
    res.status(500).json({ error: 'Failed to get online cameras' });
  }
};

// @desc    Get camera by deviceId
// @route   GET /api/camera/:deviceId
// @access  Public
exports.getCameraByDeviceId = async (req, res) => {
  try {
    const camera = await Camera.findOne({ deviceId: req.params.deviceId });
    
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }
    
    res.json({
      success: true,
      camera
    });
  } catch (error) {
    console.error('Get camera error:', error);
    res.status(500).json({ error: 'Failed to get camera' });
  }
};

// @desc    Update camera status
// @route   PUT /api/camera/:deviceId/status
// @access  Public
exports.updateCameraStatus = async (req, res) => {
  try {
    const { status, socketId } = req.body;
    
    const camera = await Camera.findOne({ deviceId: req.params.deviceId });
    
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }
    
    camera.status = status || camera.status;
    camera.socketId = socketId || camera.socketId;
    camera.lastActive = new Date();
    await camera.save();
    
    res.json({
      success: true,
      camera
    });
  } catch (error) {
    console.error('Update camera status error:', error);
    res.status(500).json({ error: 'Failed to update camera status' });
  }
};

// @desc    Delete camera
// @route   DELETE /api/camera/:deviceId
// @access  Public
exports.deleteCamera = async (req, res) => {
  try {
    const camera = await Camera.findOneAndDelete({ deviceId: req.params.deviceId });
    
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }
    
    res.json({
      success: true,
      message: 'Camera deleted'
    });
  } catch (error) {
    console.error('Delete camera error:', error);
    res.status(500).json({ error: 'Failed to delete camera' });
  }
};