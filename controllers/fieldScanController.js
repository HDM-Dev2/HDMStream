const { getFieldScanSettings } = require('../config/fieldScan');
const logger = require('../config/logger');

exports.getSettings = async (req, res) => {
  try {
    const settings = await getFieldScanSettings();
    
    if (!settings) {
      return res.status(503).json({ error: 'Field scan service unavailable' });
    }
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Get field scan settings error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};