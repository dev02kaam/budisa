const assert = require('node:assert/strict');
const net = require('net');
const {
  crc16Ibm,
  parseCodec8ExtendedFrame
} = require('../src/teltonika/codec8e');
const { startTeltonikaTcpServer } = require('../src/teltonika/tcp.server');

function buildCodec8ExtendedFrame() {
  const record = Buffer.alloc(38);
  let offset = 0;

  record.writeBigUInt64BE(1_784_914_508_000n, offset);
  offset += 8;
  record.writeUInt8(0, offset);
  offset += 1;
  record.writeInt32BE(Math.round(-3.7038 * 10_000_000), offset);
  offset += 4;
  record.writeInt32BE(Math.round(40.4168 * 10_000_000), offset);
  offset += 4;
  record.writeUInt16BE(667, offset);
  offset += 2;
  record.writeUInt16BE(125, offset);
  offset += 2;
  record.writeUInt8(9, offset);
  offset += 1;
  record.writeUInt16BE(48, offset);
  offset += 2;
  record.writeUInt16BE(0, offset);
  offset += 2;
  record.writeUInt16BE(0, offset);
  offset += 2;

  for (let index = 0; index < 5; index += 1) {
    record.writeUInt16BE(0, offset);
    offset += 2;
  }

  assert.equal(offset, record.length);

  const data = Buffer.concat([
    Buffer.from([0x8e, 0x01]),
    record,
    Buffer.from([0x01])
  ]);
  const frame = Buffer.alloc(8 + data.length + 4);
  frame.writeUInt32BE(0, 0);
  frame.writeUInt32BE(data.length, 4);
  data.copy(frame, 8);
  frame.writeUInt32BE(crc16Ibm(data), 8 + data.length);
  return frame;
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function run() {
  const frame = buildCodec8ExtendedFrame();
  const decoded = parseCodec8ExtendedFrame(frame);

  assert.equal(decoded.codecId, 0x8e);
  assert.equal(decoded.recordCount, 1);
  assert.equal(decoded.records[0].gps.latitude, 40.4168);
  assert.equal(decoded.records[0].gps.longitude, -3.7038);
  assert.equal(decoded.records[0].gps.speed, 48);
  assert.equal(decoded.records[0].gps.satellites, 9);

  const officialTeltonikaExample = Buffer.from(
    '000000000000004A8E010000016B412CEE000100000000000000000000000000000000010005000100010100010011001D00010010015E2C880002000B000000003544C87A000E000000001DD7E06A00000100002994',
    'hex'
  );
  const officialDecoded = parseCodec8ExtendedFrame(officialTeltonikaExample);
  assert.equal(officialDecoded.recordCount, 1);
  assert.equal(officialDecoded.records[0].eventIoId, 1);
  assert.equal(officialDecoded.records[0].io[17], 29);

  let receivedPacket = null;
  const logger = { info() {}, warn() {} };
  const server = await startTeltonikaTcpServer({
    port: 0,
    host: '127.0.0.1',
    logger,
    async onPacket(packet) {
      receivedPacket = packet;
      return packet.recordCount;
    }
  });

  const imei = '356307042441013';
  const imeiBuffer = Buffer.from(imei, 'ascii');
  const handshake = Buffer.alloc(2 + imeiBuffer.length);
  handshake.writeUInt16BE(imeiBuffer.length, 0);
  imeiBuffer.copy(handshake, 2);

  const reply = await new Promise((resolve, reject) => {
    const client = net.createConnection(server.address().port, '127.0.0.1');
    let response = Buffer.alloc(0);

    client.once('connect', () => {
      client.write(handshake.subarray(0, 5));
      client.write(Buffer.concat([handshake.subarray(5), frame]));
    });
    client.on('data', (chunk) => {
      response = Buffer.concat([response, chunk]);
      if (response.length >= 5) {
        client.end();
        resolve(response);
      }
    });
    client.once('error', reject);
  });

  assert.equal(reply.subarray(0, 1).toString('hex'), '01');
  assert.equal(reply.readUInt32BE(1), 1);
  assert.equal(receivedPacket.imei, imei);
  assert.equal(receivedPacket.records[0].gps.latitude, 40.4168);

  await closeServer(server);
  console.log('ok - recibe IMEI y Codec 8 Extended por TCP');
}

run().catch((error) => {
  console.error('not ok - receptor Teltonika');
  console.error(error);
  process.exitCode = 1;
});
