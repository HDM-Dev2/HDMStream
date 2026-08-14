const express = require('express');
const router = express.Router();
const captureController = require('../controllers/captureController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', captureController.getCaptures);
router.post('/', captureController.saveCapture);
router.delete('/:id', captureController.deleteCapture);

module.exports = router;