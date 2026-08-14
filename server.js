const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
require('dotenv').config();

const connectDB = require('./config/db');
const socketConfig = require('./config/socket');
const logger = require('./config/logger');

const cameraRoutes = require('./routes/cameraRoutes');
const socketRoutes = require('./routes/socketRoutes');

const socketController = require('./controllers/socketController');

const app = express();
const server = http.createServer(app);

const io = socketIO(server, socketConfig);

connectDB();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(logger.requestLogger());

app.use('/api/camera', cameraRoutes);
app.use('/api/socket', socketRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

socketController(io);

const publicDir = path.join(__dirname, 'public');
const frontendDir = path.join(__dirname, 'frontend');
const distDir = path.join(frontendDir, 'dist');

const ensureFrontendBuild = () => {
  if (!fs.existsSync(distDir)) {
    logger.info('Frontend build not found. Building...');
    try {
      execSync('npm install', { cwd: frontendDir, stdio: 'inherit' });
      execSync('npx vite build', { cwd: frontendDir, stdio: 'inherit' });
      logger.info('Frontend build completed');
    } catch (error) {
      logger.error('Failed to build frontend:', error.message);
    }
  }

  if (fs.existsSync(distDir)) {
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
    logger.info('Frontend copied to public directory');
  } else {
    logger.warn('Frontend build failed. Serving API only.');
  }
};

ensureFrontendBuild();

app.use(express.static(publicDir));

app.get('*', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).json({ 
      error: 'Frontend not built', 
      message: 'Run "cd frontend && npm install && npm run build" manually' 
    });
  }
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});