const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const connectDB = require('./config/db');
const socketConfig = require('./config/socket');
const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const cameraRoutes = require('./routes/cameraRoutes');
const socketRoutes = require('./routes/socketRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const captureRoutes = require('./routes/captureRoutes');
const scanRoutes = require('./routes/scanRoutes');
const fieldScanRoutes = require('./routes/fieldScanRoutes');

const socketController = require('./controllers/socketController');

const app = express();
const server = http.createServer(app);

const io = socketIO(server, socketConfig);

connectDB();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(logger.requestLogger());

app.use('/api/auth', authRoutes);
app.use('/api/camera', cameraRoutes);
app.use('/api/socket', socketRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/captures', captureRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/field-scan', fieldScanRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

socketController(io);

const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'frontend', 'dist');

const copyDistToPublic = () => {
  if (!fs.existsSync(distDir)) {
    logger.warn('frontend/dist not found. Run "npm run build" first.');
    return false;
  }

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const copyRecursive = (src, dest) => {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    
    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest);
      }
      fs.readdirSync(src).forEach(childItemName => {
        copyRecursive(
          path.join(src, childItemName),
          path.join(dest, childItemName)
        );
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  };

  copyRecursive(distDir, publicDir);
  logger.info('Frontend dist copied to public directory');
  return true;
};

const frontendReady = copyDistToPublic();

app.use(express.static(publicDir));

app.get('*', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).json({ 
      error: 'Frontend not built', 
      message: 'Run "npm run build" to build frontend' 
    });
  }
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  if (frontendReady) {
    logger.info('Frontend ready');
  } else {
    logger.warn('Frontend not available - API only');
  }
});