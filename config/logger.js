const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Colors for console output
const colors = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  http: '\x1b[35m',  // Magenta
  debug: '\x1b[90m', // Gray
  reset: '\x1b[0m'   // Reset
};

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'debug';
    this.logToFile = process.env.LOG_TO_FILE === 'true' || true;
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
  }

  writeToFile(level, message, meta = {}) {
    if (!this.logToFile) return;

    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `${date}.log`);
    const formattedMessage = this.formatMessage(level, message, meta);

    fs.appendFile(logFile, formattedMessage + '\n', (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }

  error(message, meta = {}) {
    if (levels[this.level] >= levels.error) {
      const formattedMessage = this.formatMessage('error', message, meta);
      console.error(`${colors.error}${formattedMessage}${colors.reset}`);
      this.writeToFile('error', message, meta);
    }
  }

  warn(message, meta = {}) {
    if (levels[this.level] >= levels.warn) {
      const formattedMessage = this.formatMessage('warn', message, meta);
      console.warn(`${colors.warn}${formattedMessage}${colors.reset}`);
      this.writeToFile('warn', message, meta);
    }
  }

  info(message, meta = {}) {
    if (levels[this.level] >= levels.info) {
      const formattedMessage = this.formatMessage('info', message, meta);
      console.info(`${colors.info}${formattedMessage}${colors.reset}`);
      this.writeToFile('info', message, meta);
    }
  }

  http(message, meta = {}) {
    if (levels[this.level] >= levels.http) {
      const formattedMessage = this.formatMessage('http', message, meta);
      console.log(`${colors.http}${formattedMessage}${colors.reset}`);
      this.writeToFile('http', message, meta);
    }
  }

  debug(message, meta = {}) {
    if (levels[this.level] >= levels.debug) {
      const formattedMessage = this.formatMessage('debug', message, meta);
      console.debug(`${colors.debug}${formattedMessage}${colors.reset}`);
      this.writeToFile('debug', message, meta);
    }
  }

  // Special log types
  socket(message, meta = {}) {
    this.info(`🔌 ${message}`, meta);
  }

  camera(message, meta = {}) {
    this.info(`📷 ${message}`, meta);
  }

  stream(message, meta = {}) {
    this.info(`📡 ${message}`, meta);
  }

  database(message, meta = {}) {
    this.info(`🗄️ ${message}`, meta);
  }

  webrtc(message, meta = {}) {
    this.debug(`🔄 ${message}`, meta);
  }

  // HTTP request logger middleware
  requestLogger() {
    return (req, res, next) => {
      const start = Date.now();
      const { method, url, ip } = req;
      
      // Log request
      this.http(`${method} ${url} - ${ip}`);
      
      // Log response
      res.on('finish', () => {
        const duration = Date.now() - start;
        const { statusCode } = res;
        
        if (statusCode >= 400) {
          this.warn(`${method} ${url} - ${statusCode} - ${duration}ms`);
        } else {
          this.http(`${method} ${url} - ${statusCode} - ${duration}ms`);
        }
      });
      
      next();
    };
  }

  // Error logger
  logError(error, context = {}) {
    this.error(error.message, {
      stack: error.stack,
      ...context
    });
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;