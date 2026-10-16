const assert = require('node:assert/strict');
const TrackerPoint = require('../src/models/TrackerPoint');
const { buildMadridDayRange, getTrackerDays } = require('../src/services/fleet.service');
const { TIPPER_SIGNAL_QUERY } = require('../src/utils/tipper');

module.exports = async function historyIndexesCases({ baseUrl, adminHeaders }) {
  // Atlas free clusters cannot spill sorts to disk. Check the actual query plan
  // for all-fleet history and both directions of per-vehicle sensor lookup.
  const range = buildMadridDayRange({ from: '2026-08-20', to: '2026-09-18' });
  for (const [filter, direction] of [
    [{ positionAt: range }, -1],
    [{ positionAt: range }, 1],
    [{ deviceId: '356000000000804', positionAt: range }, -1],
    [{ deviceId: '356000000000804', ...TIPPER_SIGNAL_QUERY }, -1],
    [{ deviceId: '356000000000804', ...TIPPER_SIGNAL_QUERY, positionAt: { $gt: range.$gte } }, 1]
  ]) {
    const plan = await TrackerPoint.find(filter)
      .sort({ positionAt: direction, receivedAt: direction, _id: direction }).limit(100000).explain('queryPlanner');
    const stages = [];
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      if (value.stage) stages.push(value.stage);
      Object.values(value).forEach(visit);
    };
    visit(plan.queryPlanner.winningPlan);
    assert.equal(stages.includes('SORT'), false, `History must avoid a blocking in-memory sort: ${stages.join(', ')}`);
    assert.ok(stages.includes('IXSCAN'), 'History and closing readings must use an index');
  }
  const response = await fetch(`${baseUrl}/api/tracker/days?from=2026-08-20&to=2026-09-18&limit=1000`, { headers: adminHeaders });
  assert.equal(response.status, 200);
  const day = (await response.json()).data.find((item) => item.imei === '356000000000804');
  assert.equal(day.tipEvents[0].endAt, '2026-09-18T10:00:41.000Z');

  // A month's history must include the opening even past the old 100,000-point
  // cutoff. Only the last sample is zero, so truncation would lose the cycle.
  const imei = '356000000000805';
  const total = 100001;
  const start = Date.parse('2026-01-02T08:00:00Z');
  try {
    for (let offset = 0; offset < total; offset += 10000) {
      await TrackerPoint.collection.insertMany(Array.from({ length: Math.min(10000, total - offset) }, (_, index) => {
        const ordinal = offset + index;
        return {
          eventId: `history-volume-${ordinal}`, deviceId: imei, positionAt: new Date(start + ordinal * 10),
          receivedAt: new Date(start + ordinal * 10), gps: { latitude: 0, longitude: 0 },
          metadata: { gpsValid: false, movement: true, rawIo: ordinal === 0 ? { 10832: 103 } : ordinal === total - 1 ? { 10832: 0 } : {} }
        };
      }));
    }
    const [fullDay] = await getTrackerDays({ imei, from: '2026-01-01', to: '2026-01-30' });
    assert.equal(fullDay.pointCount, total);
    assert.equal(fullDay.tipEvents.length, 1);
    assert.equal(fullDay.tipEvents[0].status, 'completed');
    assert.equal(fullDay.tipEvents[0].timestamp.toISOString(), new Date(start).toISOString());
    assert.equal(fullDay.tipEvents[0].durationSeconds, 1000);
  } finally {
    await TrackerPoint.deleteMany({ deviceId: imei });
  }
  console.log('ok - histórico de 30 días y lecturas de cierre usan índices sin ordenar en memoria');
};
