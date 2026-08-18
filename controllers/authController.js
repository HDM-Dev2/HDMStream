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
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      authProvider: 'local'
    });
    
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
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
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const response = await axios.post(
      `${FARMVEXA_API_URL}/api/internal/hdmstream/auth/validate`,
      { email, password },
      { 
        headers: { 'x-api-key': FARMVEXA_API_KEY },
        timeout: 15000
      }
    );
    
    if (!response.data.success) {
      return res.status(401).json({ error: 'Invalid FarmVexa credentials' });
    }
    
    const farmvexaUser = response.data.data.user;
    
    // Use EMAIL as primary lookup
    let user = await User.findOne({ 
      email: farmvexaUser.email.toLowerCase(),
      authProvider: 'farmvexa'
    });
    
    if (!user) {
      // Create new user
      user = await User.create({
        email: farmvexaUser.email.toLowerCase(),
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
    } else {
      // Update existing user with latest data
      user.farmvexaId = farmvexaUser.id;
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
    }
    
    const token = generateToken(user);
    
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
      code: error.code
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
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({ error: 'Logout failed' });
  }
};