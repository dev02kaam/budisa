require('dotenv').config();

function readPort(name, fallback) {
  const value = Number(process.env[name] || fallback);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} debe ser un puerto entre 1 y 65535`);
  }

  return value;
}

function readBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  return String(raw).toLowerCase() === 'true';
}

const config = {
  port: readPort('PORT', 3002),
  teltonikaTcpEnabled: readBoolean('TELTONIKA_TCP_ENABLED', false),
  teltonikaTcpPort: readPort('TELTONIKA_TCP_PORT', 50027),
  teltonikaPublicHost: process.env.TELTONIKA_PUBLIC_HOST || 'crossover.proxy.rlwy.net',
  teltonikaPublicPort: readPort('TELTONIKA_PUBLIC_PORT', 22945),
  trackerSharedSecret: process.env.TRACKER_SHARED_SECRET || '',
  trackerAdminToken: process.env.TRACKER_ADMIN_TOKEN || '',
  trackerKeyId: process.env.TRACKER_KEY_ID || 'gateway-v1',
  trackerSignatureToleranceSeconds: Number(process.env.TRACKER_SIGNATURE_TOLERANCE_SECONDS || 300),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/budisa',
  useMemoryMongo: readBoolean('USE_MEMORY_MONGO', false),
  nodeEnv: process.env.NODE_ENV || 'development'
};

if (!Number.isInteger(config.trackerSignatureToleranceSeconds) || config.trackerSignatureToleranceSeconds < 30) {
  throw new Error('TRACKER_SIGNATURE_TOLERANCE_SECONDS debe ser un entero mayor o igual a 30');
}

module.exports = { config };
