const mongoose = require('mongoose');
const { createTelemetrySchema } = require('./telemetry.schema');

const TrackerPointSchema = createTelemetrySchema();
TrackerPointSchema.index({ deviceId: 1, receivedAt: -1 });
TrackerPointSchema.index({ truckId: 1, receivedAt: -1 });

module.exports = mongoose.model('TrackerPoint', TrackerPointSchema, 'tracker_points');
