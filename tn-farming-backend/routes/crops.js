    const express = require('express');
const router = express.Router();
const cropController = require('../controllers/cropController');

// CREATE
router.post('/', cropController.createCrop);

// READ
router.get('/user/:firebaseUid', cropController.getUserCrops);
router.get('/active/:firebaseUid', cropController.getActiveCrops);
router.get('/land/:landId', cropController.getCropsByLand);
router.get('/:id', cropController.getCropById);

// UPDATE
router.put('/:id', cropController.updateCrop);
router.put('/:id/stage', cropController.updateGrowthStage);
router.post('/:id/update', cropController.addProgressUpdate);
router.put('/:id/harvest', cropController.markAsHarvested);

// DELETE
router.delete('/:id', cropController.deleteCrop);

module.exports = router;
