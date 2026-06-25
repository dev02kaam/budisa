const express = require('express');
const api = require('../controllers/api.controller');

const router = express.Router();

router.post('/telemetry', api.ingestTelemetry);
router.get('/summary', api.summary);
router.get('/events', api.latest);
router.get('/events/search', api.search);
router.get('/trail/:deviceId', api.trail);
router.get('/devices', api.devices);
router.get('/insights', api.insights);
router.get('/heartbeats', api.heartbeats);

module.exports = router;
