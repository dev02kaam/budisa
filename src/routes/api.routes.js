const express = require('express');
const api = require('../controllers/api.controller');
const { requireTrackerAdmin } = require('../middleware/tracker-admin.middleware');

const router = express.Router();

router.get('/fleet', api.fleet);
router.get('/tracker', api.tracker);
router.get('/tracker/days', api.trackerDays);
router.get('/tracker/status', api.trackerStatus);
router.get('/trackers', requireTrackerAdmin, api.trackers);
router.post('/trackers', requireTrackerAdmin, api.registerTrackerDevice);
router.patch('/trackers/:imei', requireTrackerAdmin, api.updateTrackerDevice);

module.exports = router;
