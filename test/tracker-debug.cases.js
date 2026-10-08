const assert = require('node:assert/strict');
const TrackerReception = require('../src/models/TrackerReception');
const TrackerPoint = require('../src/models/TrackerPoint');
const { ingestPacket } = require('../src/services/teltonika.service');
const { parseCodec8ExtendedFrame } = require('../src/teltonika/codec8e');

module.exports = async function trackerDebugCases({ baseUrl, adminHeaders, buildPayload, signedRequest }) {
  const debugUrl = `${baseUrl}/api/tracker/debug`;
  const getPage = (query = '') => fetch(`${debugUrl}${query}`, { headers: adminHeaders }).then((response) => response.json());
  const detail = (id) => fetch(`${debugUrl}/${id}`, { headers: adminHeaders }).then((response) => response.json());
  assert.equal((await fetch(debugUrl)).status, 401);

  const payload = buildPayload();
  payload.extraGatewayField = { '$original': 'preservado', 'campo.con.puntos': [1, 2], text: '<script>untrusted</script>' };
  payload.records[0].io.raw[10832] = 35;
  const request = signedRequest(payload);
  // Exact whitespace is retained alongside all fields, including speed omitted by the fleet view.
  const response = await fetch(`${baseUrl}/tracker`, { method: 'POST', ...request });
  assert.equal(response.status, 200);
  const pageResponse = await fetch(debugUrl, { headers: adminHeaders });
  assert.equal(pageResponse.headers.get('cache-control'), 'no-store');
  const page = (await pageResponse.json()).data;
  const reception = page.items.find((item) => item.packetId === payload.packet.packetId);
  assert.ok(reception);
  assert.equal(reception.recordCount, 2);
  assert.equal(reception.accepted, 2);
  assert.equal(reception.statusCode, 200);
  assert.equal(reception.transport, 'https');
  assert.ok(reception.receivedAt);
  assert.equal('rawBody' in reception, false);
  assert.equal('payload' in reception, false);
  assert.equal((await fetch(`${debugUrl}/${reception._id}`)).status, 401);
  const saved = (await detail(reception._id)).data;
  assert.equal(saved.rawBody, request.body);
  assert.deepEqual(saved.payload, payload);
  assert.equal(saved.payload.records[0].gps.speedKph, 42);
  assert.deepEqual(saved.response, { ok: true, accepted: 2 });

  const pointCount = await TrackerPoint.countDocuments();
  assert.equal((await fetch(`${baseUrl}/tracker`, { method: 'POST', ...signedRequest(payload) })).status, 200);
  const repeatPage = (await getPage()).data.items;
  assert.equal(repeatPage.filter((item) => item.packetId === payload.packet.packetId).length, 2);
  assert.equal(await TrackerPoint.countDocuments(), pointCount);

  assert.ok(page.items.some((item) => item.code === 'UNKNOWN_DEVICE'));
  assert.ok(page.items.some((item) => item.code === 'INVALID_SIGNATURE'));
  const authError = page.items.find((item) => item.code === 'INVALID_SIGNATURE');
  assert.equal((await detail(authError._id)).data.response.ok, false);

  const malformed = '{ "device": ';
  assert.equal((await fetch(`${baseUrl}/tracker?debug=1`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: malformed
  })).status, 400);
  const malformedItem = (await getPage()).data.items.find((item) => item.code === 'INVALID_PAYLOAD');
  assert.equal((await detail(malformedItem._id)).data.rawBody, malformed);
  assert.equal((await detail(malformedItem._id)).data.payload, null);

  const invalidPayload = { ...payload, packet: { ...payload.packet, recordCount: 99 } };
  assert.equal((await fetch(`${baseUrl}/tracker`, { method: 'POST', ...signedRequest(invalidPayload) })).status, 400);
  const invalidItem = (await getPage()).data.items.find((item) => item.code === 'INVALID_PAYLOAD');
  assert.deepEqual((await detail(invalidItem._id)).data.payload, invalidPayload);

  for (const query of ['?imei=bad', '?date=2026-02-30', '?date=2026-10-08&date=2026-10-09', '?before=bad']) {
    assert.equal((await fetch(`${debugUrl}${query}`, { headers: adminHeaders })).status, 400);
  }
  assert.equal((await fetch(`${debugUrl}/invalid`, { headers: adminHeaders })).status, 400);
  assert.equal((await fetch(`${debugUrl}/000000000000000000000000`, { headers: adminHeaders })).status, 404);

  // All pages remain reachable, with dates filtered by the server's Madrid reception time.
  const imei = '356000000000090';
  const base = Date.parse('2026-03-28T23:00:00Z');
  const fixture = (receivedAt) => ({ imei, receivedAt: new Date(receivedAt), transport: 'https',
    statusCode: 200, accepted: 1, recordCount: 1, response: { ok: true, accepted: 1 }, rawBody: '{"test":true}' });
  await TrackerReception.insertMany(Array.from({ length: 61 }, (_, index) => fixture(base + index * 1000)));
  await TrackerReception.insertMany([fixture(base - 1), fixture(Date.parse('2026-03-29T22:00:00Z'))]);
  const filter = `?imei=${imei}&date=2026-03-29`;
  const firstPage = (await getPage(filter)).data;
  assert.equal(firstPage.items.length, 50);
  assert.ok(firstPage.nextCursor);
  const secondPage = (await getPage(`${filter}&before=${firstPage.nextCursor}`)).data;
  assert.equal(secondPage.items.length, 11);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item._id)).size, 61);
  assert.deepEqual((await getPage('?date=2026-01-01')).data.items, []);

  // Local TCP includes the complete binary frame as well as its decoded payload.
  const rawFrame = Buffer.from('000000000000004A8E010000016B412CEE000100000000000000000000000000000000010005000100010100010011001D00010010015E2C880002000B000000003544C87A000E000000001DD7E06A00000100002994', 'hex');
  const decoded = parseCodec8ExtendedFrame(rawFrame);
  assert.equal(await ingestPacket({ imei: '356000000000001', ...decoded, rawFrame }), 1);
  const tcpItem = (await getPage()).data.items.find((item) => item.transport === 'tcp');
  const tcpDetail = (await detail(tcpItem._id)).data;
  assert.equal(tcpDetail.rawFrameHex, rawFrame.toString('hex'));
  assert.equal(tcpDetail.payload.records[0].io.raw[17], 29);

  const originalCreate = TrackerReception.create;
  const originalConsoleError = console.error;
  const warnings = [];
  try {
    TrackerReception.create = async () => { throw Object.assign(new Error('debug storage unavailable'), { code: 'TEST_DB_ERROR' }); };
    console.error = (...args) => warnings.push(args);
    const result = await fetch(`${baseUrl}/tracker`, { method: 'POST', ...signedRequest(buildPayload()) });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true, accepted: 2 });
    assert.deepEqual(warnings, [['tracker_debug_save_failed', { code: 'TEST_DB_ERROR' }]]);
  } finally {
    TrackerReception.create = originalCreate;
    console.error = originalConsoleError;
  }
  console.log('ok - debug conserva recepciones, rechazos, JSON original, fechas Madrid, páginas y TCP');
};
