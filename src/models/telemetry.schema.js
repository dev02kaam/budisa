const mongoose = require('mongoose');

function createTelemetrySchema() {
  return new mongoose.Schema(
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
          'gps',
          'control_heartbeat'
        ]
      },
      event: {
        type: String,
        required: true
      },
      category: {
        type: String,
        required: true,
        enum: ['history', 'tracker', 'state']
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
      lat: {
        type: Number,
        default: null
      },
      lon: {
        type: Number,
        default: null
      },
      speed: {
        type: Number,
        default: null
      },
      gpsTimestamp: {
        type: String,
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
}

module.exports = { createTelemetrySchema };
