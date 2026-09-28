const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/', uploadController.uploadImage);
router.delete('/', uploadController.deleteImage);

module.exports = router;