require('dotenv/config');

const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  farmvexa: {
    apiUrl: process.env.FARMVEXA_API_URL,
    apiKey: process.env.FARMVEXA_API_KEY,
  },
  logLevel: process.env.LOG_LEVEL || 'info',
});

module.exports = { env };