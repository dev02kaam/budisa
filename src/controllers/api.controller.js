const eventService = require('../services/event.service');
const { normalizePayload } = require('../utils/telemetry');

async function ingestTelemetry(req, res, next) {
  try {
    const payload = normalizePayload(req.body);
    const event = await eventService.createEvent(payload);
    res.status(201).json({ ok: true, event });
  } catch (error) {
    next(error);
  }
}

async function summary(req, res, next) {
  try {
    const data = await eventService.getSummary();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

async function latest(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 20), 500);
    const events = await eventService.getLatestEvents(limit);
    res.json({ ok: true, data: events });
  } catch (error) {
    next(error);
  }
}

async function search(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 200), 1000);
    const events = await eventService.getEvents(
      {
        deviceId: req.query.deviceId,
        truckId: req.query.truckId,
        signal: req.query.signal,
        gpioState: req.query.gpioState,
        hasGps: String(req.query.hasGps || '').toLowerCase() === 'true',
        from: req.query.from,
        to: req.query.to,
        q: req.query.q
      },
      limit
    );
    res.json({ ok: true, data: events });
  } catch (error) {
    next(error);
  }
}

async function trail(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const deviceId = String(req.params.deviceId || 'raspberry-1');
    const points = await eventService.getTrail(deviceId, limit);
    res.json({ ok: true, data: points });
  } catch (error) {
    next(error);
  }
}

async function tracker(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 5000), 10000);
    const points = await eventService.getTrackerPoints(
      {
        deviceId: req.query.imei || req.query.deviceId,
        truckId: req.query.truckId,
        from: req.query.from,
        to: req.query.to
      },
      limit
    );
    res.json({ ok: true, data: points });
  } catch (error) {
    next(error);
  }
}

async function trackerDays(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 90);
    const days = await eventService.getTrackerDays(
      {
        deviceId: req.query.imei || req.query.deviceId,
        truckId: req.query.truckId
      },
      limit
    );
    res.json({ ok: true, data: days });
  } catch (error) {
    next(error);
  }
}

async function trackerStatus(req, res, next) {
  try {
    const { getGatewayStatus } = require('../services/tracker-gateway.service');
    const status = await getGatewayStatus();
    res.json({ ok: true, data: status });
  } catch (error) {
    next(error);
  }
}

async function trackers(req, res, next) {
  try {
    const { listTrackers } = require('../services/tracker-gateway.service');
    const list = await listTrackers();
    res.json({ ok: true, data: list });
  } catch (error) {
    next(error);
  }
}

async function registerTrackerDevice(req, res, next) {
  try {
    const { registerTracker } = require('../services/tracker-gateway.service');
    const tracker = await registerTracker({ imei: String(req.body?.imei || '').trim() });
    res.status(201).json({
      ok: true,
      data: { imei: tracker.imei, status: 'approved', enabled: true }
    });
  } catch (error) {
    next(error);
  }
}

async function updateTrackerDevice(req, res, next) {
  try {
    if (typeof req.body?.enabled !== 'boolean') {
      const error = new Error('enabled debe ser true o false');
      error.statusCode = 400;
      throw error;
    }
    const { setTrackerApproval } = require('../services/tracker-gateway.service');
    const tracker = await setTrackerApproval(req.params.imei, req.body.enabled);
    res.json({
      ok: true,
      data: {
        imei: tracker.imei,
        status: tracker.approvalStatus,
        enabled: tracker.enabled
      }
    });
  } catch (error) {
    next(error);
  }
}

async function devices(req, res, next) {
  try {
    const list = await eventService.getDevices();
    res.json({ ok: true, data: list });
  } catch (error) {
    next(error);
  }
}

async function insights(req, res, next) {
  try {
    const data = await eventService.getInsights();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
}

async function heartbeats(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 200), 1000);
    const events = await eventService.getHeartbeats(limit);
    res.json({ ok: true, data: events });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  ingestTelemetry,
  summary,
  latest,
  search,
  trail,
  tracker,
  trackerDays,
  trackerStatus,
  trackers,
  registerTrackerDevice,
  updateTrackerDevice,
  devices,
  insights,
  heartbeats
};
