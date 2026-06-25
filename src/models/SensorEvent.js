const mongoose = require('mongoose');

const SensorEventSchema = new mongoose.Schema(
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
      index: true
    },
    truckId: {
      type: String,
      required: true,
      index: true
    },
    signal: {
      type: String,
      required: true,
      enum: [
        'bascula_subida',
        'bascula_bajada',
        'bascula_levantada',
        'estado_estable',
        'alerta',
        'control_heartbeat'
      ]
    },
    event: {
      type: String,
      required: true
    },
    gpio: {
      type: Number,
      default: null
    },
    gpioState: {
      type: Number,
      default: null
    },
    reason: {
      type: String,
      default: null
    },
    thresholdSeconds: {
      type: Number,
      default: null
    },
    gps: {
      latitude: {
        type: Number,
        default: null
      },
      longitude: {
        type: Number,
        default: null
      },
      altitude: {
        type: Number,
        default: null
      },
      speed: {
        type: Number,
        default: null
      },
      heading: {
        type: Number,
        default: null
      },
      timestamp: {
        type: String,
        default: null
      }
    },
    battery: {
      type: Number,
      default: null
    },
    source: {
      type: String,
      default: 'raspberry'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    versionKey: false
  }
);

SensorEventSchema.index({ truckId: 1, receivedAt: -1 });
SensorEventSchema.index({ deviceId: 1, receivedAt: -1 });

module.exports = mongoose.model('SensorEvent', SensorEventSchema);
