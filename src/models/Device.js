const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    name: {
      type: String,
      default: 'Raspberry Sensor'
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    lastSignal: {
      type: String,
      default: null
    },
    lastGps: {
      latitude: Number,
      longitude: Number,
      altitude: Number,
      speed: Number,
      heading: Number,
      locationSource: {
        type: String,
        enum: ['gps', 'red'],
        default: null
      },
      locationProvider: {
        type: String,
        default: null
      },
      locationAccuracyMeters: {
        type: Number,
        default: null
      }
    },
    status: {
      type: String,
      enum: ['online', 'idle', 'offline'],
      default: 'offline'
    }
  },
  {
    versionKey: false
  }
);

module.exports = mongoose.model('Device', DeviceSchema);
