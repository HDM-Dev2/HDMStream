const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hdm-stream-secret';

module.exports = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.authProvider = decoded.authProvider;
    req.farmvexaId = decoded.farmvexaId;
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};