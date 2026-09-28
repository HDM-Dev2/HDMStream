require('dotenv/config');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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

async function bootstrap() {
  const PORT = process.env.PORT || process.env.EXPOSE_PORT || 3000;

  console.log(`Starting server on port ${PORT}...`);
  console.log(`PORT=${process.env.PORT} EXPOSE_PORT=${process.env.EXPOSE_PORT}`);

  const app = express();
  app.set('trust proxy', 1);

  const server = http.createServer(app);
  const io = socketIO(server, socketConfig);

  // ---- Global middleware ----
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(logger.requestLogger());

  // ---- API routes ----
  app.use('/api/auth', authRoutes);
  app.use('/api/camera', cameraRoutes);
  app.use('/api/socket', socketRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/captures', captureRoutes);
  app.use('/api/scans', scanRoutes);
  app.use('/api/field-scan', fieldScanRoutes);

  // ---- Health check ----
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ---- Socket.IO controller ----
  socketController(io);

  // ---- Static frontend (served directly, no copying) ----
  const distDir = path.join(__dirname, 'frontend', 'dist');
  const publicDir = path.join(__dirname, 'public');

  // Prefer the built frontend if it exists, otherwise fall back to /public
  const staticDir = fs.existsSync(distDir)
    ? distDir
    : fs.existsSync(publicDir)
      ? publicDir
      : null;

  if (staticDir) {
    console.log(`Serving static files from: ${staticDir}`);
    app.use(express.static(staticDir));

    // SPA fallback — send index.html for non-API GET requests
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      const indexPath = path.join(staticDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(503).json({ error: 'Frontend not built' });
      }
    });
  } else {
    console.warn('No frontend build found (checked frontend/dist and public)');
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.status(503).json({ error: 'Frontend not built' });
    });
  }

  // ---- Error handler (must be last) ----
  app.use(errorHandler);

  // ---- 1) Open the port FIRST so the platform probe succeeds ----
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    logger.info(`Server running on port ${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Server listen error:', err);
    logger.error('Server listen error', { error: err.message, code: err.code });
    process.exit(1);
  });

  // ---- 2) Then connect DB (non-blocking startup) ----
  try {
    await connectDB();
    console.log('DB connected');
    logger.info('DB connected');
  } catch (err) {
    console.error('DB connection failed:', err.message);
    logger.error('DB connection failed', { error: err.message });
    // Uncomment the next line if the app cannot function without the DB:
    // process.exit(1);
  }

  // ---- Graceful shutdown ----
  const shutdown = (signal) => {
    console.log(`Received ${signal}, shutting down...`);
    logger.info(`Received ${signal}, shutting down`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    // Force exit if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});