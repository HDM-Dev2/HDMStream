const express = require('express');
const router = express.Router();
const scanController = require('../controllers/scanController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', scanController.getScans);
router.post('/', scanController.saveScan);
router.delete('/:id', scanController.deleteScan);
router.delete('/:id/photo/:photoId', scanController.deletePhoto);
router.put('/:id/photo/:photoId/mark', scanController.toggleMarkPhoto);
router.put('/:id/mark-all', scanController.markAllPhotos);
router.delete('/:id/bulk-delete-marked', scanController.bulkDeleteMarked);

module.exports = router;