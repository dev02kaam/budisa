const mongoose = require('mongoose');
const { createTelemetrySchema } = require('./telemetry.schema');

const HeartbeatEventSchema = createTelemetrySchema();
HeartbeatEventSchema.index({ deviceId: 1, receivedAt: -1 });
HeartbeatEventSchema.index({ truckId: 1, receivedAt: -1 });

module.exports = mongoose.model('HeartbeatEvent', HeartbeatEventSchema, 'heartbeat_events');
