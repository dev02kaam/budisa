const express = require('express');
const api = require('../controllers/api.controller');
const { requireTrackerAdmin } = require('../middleware/tracker-admin.middleware');

const router = express.Router();

router.post('/telemetry', api.ingestTelemetry);
router.get('/summary', api.summary);
router.get('/events', api.latest);
router.get('/events/search', api.search);
router.get('/trail/:deviceId', api.trail);
router.get('/tracker', api.tracker);
router.get('/tracker/days', api.trackerDays);
router.get('/tracker/status', api.trackerStatus);
router.get('/trackers', requireTrackerAdmin, api.trackers);
router.post('/trackers', requireTrackerAdmin, api.registerTrackerDevice);
router.patch('/trackers/:imei', requireTrackerAdmin, api.updateTrackerDevice);
router.get('/devices', api.devices);
router.get('/insights', api.insights);
router.get('/heartbeats', api.heartbeats);

module.exports = router;
