const express = require('express');
const router = express.Router();
const cameraController = require('../controllers/cameraController');

// Register camera
router.post('/register', cameraController.registerCamera);

// Get all cameras
router.get('/', cameraController.getAllCameras);

// Get online cameras
router.get('/online', cameraController.getOnlineCameras);

// Get camera by deviceId
router.get('/:deviceId', cameraController.getCameraByDeviceId);

// Update camera status
router.put('/:deviceId/status', cameraController.updateCameraStatus);

// Delete camera
router.delete('/:deviceId', cameraController.deleteCamera);

module.exports = router;