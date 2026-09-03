const crypto = require('crypto');

class TrackerAuthError extends Error {
  constructor(message, code = 'INVALID_SIGNATURE', diagnosticCode = 'AUTH_FAILED') {
    super(message);
    this.name = 'TrackerAuthError';
    this.code = code;
    this.diagnosticCode = diagnosticCode;
    this.statusCode = 401;
  }
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildCanonicalTrackerRequest({ timestamp, nonce, contentSha256 }) {
  return ['v1', timestamp, nonce, contentSha256].join('\n');
}

function timingSafeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function headerValue(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '').trim();
}

function signatureDigests(signatureHeader) {
  return String(signatureHeader || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3).toLowerCase());
}

function verifyTrackerRequest({
  headers,
  rawBody,
  secret,
  expectedKeyId,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000)
}) {
  if (!secret) {
    const error = new TrackerAuthError(
      'TRACKER_SHARED_SECRET no esta configurado',
      'TRACKER_NOT_CONFIGURED',
      'TRACKER_NOT_CONFIGURED'
    );
    error.statusCode = 503;
    throw error;
  }

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new TrackerAuthError(
      'No se ha conservado el cuerpo original de la peticion',
      'INVALID_SIGNATURE',
      'RAW_BODY_MISSING'
    );
  }

  const keyId = headerValue(headers, 'x-tracker-key-id');
  const timestamp = headerValue(headers, 'x-tracker-timestamp');
  const nonce = headerValue(headers, 'x-tracker-nonce');
  const contentSha256 = headerValue(headers, 'x-tracker-content-sha256').toLowerCase();
  const signatures = signatureDigests(headerValue(headers, 'x-tracker-signature'));
  const numericTimestamp = Number(timestamp);

  if (keyId !== expectedKeyId || !/^\d+$/.test(timestamp) || !/^[A-Za-z0-9_-]{8,128}$/.test(nonce)) {
    throw new TrackerAuthError(
      'Cabeceras de autenticacion incompletas o invalidas',
      'INVALID_SIGNATURE',
      'INVALID_HEADERS'
    );
  }

  if (!Number.isSafeInteger(numericTimestamp) || Math.abs(nowSeconds - numericTimestamp) > toleranceSeconds) {
    throw new TrackerAuthError(
      'La firma esta fuera de la ventana temporal permitida',
      'INVALID_SIGNATURE',
      'TIMESTAMP_OUT_OF_RANGE'
    );
  }

  const actualContentSha256 = sha256Hex(rawBody);
  if (!timingSafeHexEqual(actualContentSha256, contentSha256)) {
    throw new TrackerAuthError(
      'El hash del contenido no coincide',
      'INVALID_SIGNATURE',
      'BODY_HASH_MISMATCH'
    );
  }

  const canonical = buildCanonicalTrackerRequest({ timestamp, nonce, contentSha256 });
  const expectedSignature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  const valid = signatures.some((signature) => timingSafeHexEqual(expectedSignature, signature));

  if (!valid) {
    throw new TrackerAuthError('Firma HMAC incorrecta', 'INVALID_SIGNATURE', 'HMAC_MISMATCH');
  }

  return { keyId, nonce, timestamp: numericTimestamp, contentSha256 };
}

module.exports = {
  TrackerAuthError,
  buildCanonicalTrackerRequest,
  sha256Hex,
  verifyTrackerRequest
};
