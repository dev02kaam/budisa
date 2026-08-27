const mongoose = require('mongoose');

const GpsSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    altitude: { type: Number, default: 0 },
    heading: { type: Number, default: 0 }
  },
  { _id: false }
);

const TrackerPointSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    deviceId: {
      type: String,
      required: true,
      match: /^\d{15}$/,
      index: true
    },
    positionAt: {
      type: Date,
      required: true,
      index: true
    },
    gps: {
      type: GpsSchema,
      required: true
    },
    source: {
      type: String,
      default: 'teltonika-gateway'
    },
    metadata: {
      trackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tracker' },
      imei: String,
      iccid: String,
      packetId: String,
      codec: String,
      recordIndex: Number,
      priority: Number,
      satellites: Number,
      gpsValid: Boolean,
      eventIoId: mongoose.Schema.Types.Mixed,
      ignition: mongoose.Schema.Types.Mixed,
      movement: mongoose.Schema.Types.Mixed,
      totalOdometerM: Number,
      knownIo: mongoose.Schema.Types.Mixed,
      rawIo: mongoose.Schema.Types.Mixed
    },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

TrackerPointSchema.index({ deviceId: 1, positionAt: -1 });
TrackerPointSchema.index({ deviceId: 1, receivedAt: -1 });

module.exports = mongoose.model('TrackerPoint', TrackerPointSchema, 'tracker_points');
