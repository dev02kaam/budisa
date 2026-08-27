const express = require('express');
const api = require('../controllers/api.controller');

const router = express.Router();

router.get('/fleet', api.fleet);
router.get('/tracker', api.tracker);
router.get('/tracker/days', api.trackerDays);
router.get('/tracker/status', api.trackerStatus);
router.get('/trackers', api.trackers);
router.post('/trackers', api.registerTrackerDevice);
router.post('/trackers/import', api.importTrackerDevices);
router.patch('/trackers/:imei', api.updateTrackerDevice);

module.exports = router;
