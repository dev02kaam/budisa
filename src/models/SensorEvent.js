const mongoose = require('mongoose');
const { createTelemetrySchema } = require('./telemetry.schema');

const SensorEventSchema = createTelemetrySchema();
SensorEventSchema.index({ truckId: 1, receivedAt: -1 });
SensorEventSchema.index({ deviceId: 1, receivedAt: -1 });

module.exports = mongoose.model('SensorEvent', SensorEventSchema);
