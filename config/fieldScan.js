const axios = require('axios');
const logger = require('./logger');

const FARMVEXA_API_URL = process.env.FARMVEXA_API_URL;

const getFieldScanSettings = async () => {
  try {
    const response = await axios.get(
      `${FARMVEXA_API_URL}/api/admin/public/settings`,
      { timeout: 10000 }
    );
    
    if (response.data.success) {
      return {
        fieldScan: response.data.data.fieldScan,
        allowExternalCamera: response.data.data.allowExternalCamera,
        externalCameraInUrl: response.data.data.externalCameraInUrl,
        externalCameraOutUrl: response.data.data.externalCameraOutUrl
      };
    }
    return null;
  } catch (error) {
    logger.error('Failed to fetch field scan settings', { error: error.message });
    return null;
  }
};

module.exports = { getFieldScanSettings };