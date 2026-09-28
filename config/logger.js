const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  http: '\x1b[35m',  // Magenta
  debug: '\x1b[90m', // Gray
  reset: '\x1b[0m',  // Reset
};


const useColor = process.stdout.isTTY;

function colorize(level, text) {
  if (!useColor) return text;
  return `${colors[level] || ''}${text}${colors.reset}`;
}

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'debug';
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaString =
      meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
  }

  error(message, meta = {}) {
    if (levels[this.level] >= levels.error) {
      const line = colorize('error', this.formatMessage('error', message, meta));
      process.stderr.write(line + '\n');
    }
  }

  warn(message, meta = {}) {
    if (levels[this.level] >= levels.warn) {
      const line = colorize('warn', this.formatMessage('warn', message, meta));
      process.stderr.write(line + '\n');
    }
  }

  info(message, meta = {}) {
    if (levels[this.level] >= levels.info) {
      const line = colorize('info', this.formatMessage('info', message, meta));
      process.stdout.write(line + '\n');
    }
  }

  http(message, meta = {}) {
    if (levels[this.level] >= levels.http) {
      const line = colorize('http', this.formatMessage('http', message, meta));
      process.stdout.write(line + '\n');
    }
  }

  debug(message, meta = {}) {
    if (levels[this.level] >= levels.debug) {
      const line = colorize('debug', this.formatMessage('debug', message, meta));
      process.stdout.write(line + '\n');
    }
  }


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

  // ---- HTTP request logger middleware ----
  requestLogger() {
    return (req, res, next) => {
      const start = Date.now();
      const { method, url, ip } = req;

      this.http(`${method} ${url} - ${ip}`);

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

  // ---- Error logger ----
  logError(error, context = {}) {
    this.error(error.message, {
      stack: error.stack,
      ...context,
    });
  }
}

const logger = new Logger();

module.exports = logger;