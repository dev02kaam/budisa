const { config } = require('../config/env');
const {
  claimNonce,
  ingestGatewayPacket,
  releaseNonce
} = require('../services/tracker-gateway.service');
const { TrackerAuthError, verifyTrackerRequest } = require('../utils/tracker-auth');
const { recordTrackerReception } = require('../services/tracker-debug.service');

const rawJsonOptions = {
  limit: '2mb',
  type: 'application/json',
  verify(req, res, buffer) {
    req.rawBody = Buffer.from(buffer);
  }
};

function beginTrackerReception(req, res, next) {
  req.trackerReceivedAt = new Date();
  next();
}

async function sendTrackerResponse(req, res, status, response, error) {
  await recordTrackerReception({
    payload: req.body,
    rawBody: req.rawBody,
    receivedAt: req.trackerReceivedAt,
    statusCode: status,
    response,
    diagnosticCode: error?.diagnosticCode || ''
  });
  return res.status(status).json(response);
}

function sendTrackerError(res, error, req) {
  const status = error.statusCode || error.status || 400;
  const code = error.code || 'INVALID_PAYLOAD';
  if (req) return sendTrackerResponse(req, res, status, { ok: false, code }, error);
  return res.status(status).json({ ok: false, code });
}

function logTrackerAuthFailure(req, error) {
  const rawKeyId = req.headers['x-tracker-key-id'];
  const keyId = Array.isArray(rawKeyId) ? rawKeyId[0] : rawKeyId;
  console.warn('tracker_auth_failed', {
    code: error.diagnosticCode || error.code,
    keyId: typeof keyId === 'string' ? keyId.slice(0, 128) : null,
    hasRawBody: Buffer.isBuffer(req.rawBody),
    bodyLength: req.rawBody?.length
  });
}

async function ingestTracker(req, res) {
  let auth = null;

  try {
    auth = verifyTrackerRequest({
      headers: req.headers,
      rawBody: req.rawBody,
      secret: config.trackerSharedSecret,
      expectedKeyId: config.trackerKeyId,
      toleranceSeconds: config.trackerSignatureToleranceSeconds
    });
    await claimNonce({
      ...auth,
      toleranceSeconds: config.trackerSignatureToleranceSeconds
    });

    try {
      const accepted = await ingestGatewayPacket(req.body);
      return sendTrackerResponse(req, res, 200, { ok: true, accepted });
    } catch (error) {
      await releaseNonce(auth);
      throw error;
    }
  } catch (error) {
    if (error instanceof TrackerAuthError) {
      logTrackerAuthFailure(req, error);
    }
    return sendTrackerError(res, error, req);
  }
}

module.exports = { beginTrackerReception, ingestTracker, logTrackerAuthFailure, rawJsonOptions, sendTrackerError };
