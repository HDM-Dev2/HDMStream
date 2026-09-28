const express = require('express');
const router = express.Router();
const path = require('path');
const { roomManager } = require('../models/Room');

// API Routes
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Get all active rooms
router.get('/rooms', (req, res) => {
  const rooms = roomManager.getAllRooms().map(room => ({
    id: room.id,
    cameraCount: room.getCameraCount(),
    viewerCount: room.getViewerCount(),
    createdAt: room.createdAt
  }));
  
  res.json({
    rooms: rooms,
    totalRooms: rooms.length
  });
});

// Get specific room info
router.get('/rooms/:roomId', (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  
  res.json({
    id: room.id,
    cameraCount: room.getCameraCount(),
    viewerCount: room.getViewerCount(),
    cameras: room.getCameras(),
    viewers: room.getViewers()
  });
});

// Create new room
router.post('/rooms', (req, res) => {
  const { roomId } = req.body;
  
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }
  
  const room = roomManager.getRoom(roomId);
  
  res.json({
    roomId: room.id,
    message: 'Room created successfully'
  });
});

// Delete room
router.delete('/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  
  if (roomManager.getRoom(roomId).isEmpty()) {
    roomManager.removeRoom(roomId);
    res.json({ message: 'Room deleted successfully' });
  } else {
    res.status(400).json({ error: 'Cannot delete room with active connections' });
  }
});

// Frontend routes (for development)
if (process.env.NODE_ENV !== 'production') {
  router.get('/', (req, res) => {
    res.json({
      message: 'HDM Stream API',
      endpoints: {
        health: '/api/health',
        rooms: '/api/rooms',
        createRoom: 'POST /api/rooms',
        getRoom: '/api/rooms/:roomId'
      }
    });
  });
}

module.exports = router;