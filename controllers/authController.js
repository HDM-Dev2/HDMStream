const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const logger = require('../config/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'hdm-stream-secret';
const FARMVEXA_API_URL = process.env.FARMVEXA_API_URL;
const FARMVEXA_API_KEY = process.env.FARMVEXA_API_KEY;

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      authProvider: user.authProvider,
      farmvexaId: user.farmvexaId || null
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

exports.register = async (req, res) => {
  try {
    const { email, password, username, deviceName } = req.body;
    
    logger.info('Register attempt', { email });
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      username: username || email.split('@')[0],
      authProvider: 'local',
      deviceName: deviceName || username || email.split('@')[0]
    });
    
    logger.info('User registered', { userId: user._id, email: user.email });
    
    const token = generateToken(user);
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        deviceName: user.deviceName,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    logger.error('Register error', { error: error.message });
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    logger.info('Login attempt', { email });
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      authProvider: 'local'
    });
    
    if (!user || !user.password) {
      logger.warn('Login failed - user not found', { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.warn('Login failed - wrong password', { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    logger.info('User logged in', { userId: user._id, email: user.email });
    
    const token = generateToken(user);
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        deviceName: user.deviceName,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.loginWithFarmvexa = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    logger.info('FarmVexa login attempt', { email });
    logger.info('FarmVexa API URL', { url: FARMVEXA_API_URL });
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    logger.info('Calling FarmVexa validation endpoint...');
    
    const response = await axios.post(
      `${FARMVEXA_API_URL}/api/internal/hdmstream/auth/validate`,
      { email, password },
      { 
        headers: { 'x-api-key': FARMVEXA_API_KEY },
        timeout: 15000
      }
    );
    
    logger.info('FarmVexa response received', { 
      success: response.data.success,
      hasUser: !!response.data?.data?.user
    });
    
    if (!response.data.success) {
      logger.warn('FarmVexa validation failed', { email });
      return res.status(401).json({ error: 'Invalid FarmVexa credentials' });
    }
    
    const farmvexaUser = response.data.data.user;
    logger.info('FarmVexa user data', { 
      id: farmvexaUser.id,
      name: farmvexaUser.name,
      email: farmvexaUser.email
    });
    
    let user = await User.findOne({ farmvexaId: farmvexaUser.id });
    
    if (!user) {
      user = await User.create({
        email: farmvexaUser.email,
        authProvider: 'farmvexa',
        farmvexaId: farmvexaUser.id,
        deviceName: farmvexaUser.name,
        farmvexaData: {
          name: farmvexaUser.name,
          farmId: farmvexaUser.farmId,
          role: farmvexaUser.role,
          county: farmvexaUser.county,
          subCounty: farmvexaUser.subCounty,
          phone: farmvexaUser.phone,
          farms: farmvexaUser.farms || []
        }
      });
      logger.info('New FarmVexa user created', { userId: user._id });
    } else {
      user.email = farmvexaUser.email;
      user.deviceName = farmvexaUser.name;
      user.farmvexaData = {
        name: farmvexaUser.name,
        farmId: farmvexaUser.farmId,
        role: farmvexaUser.role,
        county: farmvexaUser.county,
        subCounty: farmvexaUser.subCounty,
        phone: farmvexaUser.phone,
        farms: farmvexaUser.farms || []
      };
      user.lastLogin = new Date();
      await user.save();
      logger.info('FarmVexa user updated', { userId: user._id });
    }
    
    const token = generateToken(user);
    logger.info('Token generated for user', { userId: user._id });
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        deviceName: user.deviceName,
        authProvider: user.authProvider,
        farmvexaId: user.farmvexaId,
        farmvexaData: user.farmvexaData
      }
    });
  } catch (error) {
    logger.error('FarmVexa login error', {
      message: error.message,
      code: error.code,
      responseData: error.response?.data,
      responseStatus: error.response?.status
    });
    
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'Invalid FarmVexa credentials' });
    }
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ error: 'FarmVexa service unavailable' });
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'FarmVexa service timeout' });
    }
    if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      return res.status(502).json({ error: 'FarmVexa SSL certificate error' });
    }
    
    res.status(500).json({ 
      error: 'FarmVexa authentication failed',
      details: error.message
    });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        deviceName: user.deviceName,
        authProvider: user.authProvider,
        farmvexaId: user.farmvexaId,
        farmvexaData: user.farmvexaData
      }
    });
  } catch (error) {
    logger.error('Get current user error', { error: error.message });
    res.status(500).json({ error: 'Failed to get user' });
  }
};

exports.logout = async (req, res) => {
  try {
    logger.info('User logged out', { userId: req.userId });
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({ error: 'Logout failed' });
  }
};