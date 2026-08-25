const CODEC_8_EXTENDED = 0x8e;
const MAX_AVL_DATA_LENGTH = 1280;

function crc16Ibm(buffer) {
  let crc = 0;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }

  return crc & 0xffff;
}

class BufferReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  ensure(size) {
    if (this.offset + size > this.buffer.length) {
      throw new Error('Paquete AVL incompleto');
    }
  }

  uint8() {
    this.ensure(1);
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  uint16() {
    this.ensure(2);
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  int32() {
    this.ensure(4);
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  uint64() {
    this.ensure(8);
    const value = this.buffer.readBigUInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  bytes(size) {
    this.ensure(size);
    const value = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }
}

function decodeIoValue(buffer) {
  if (buffer.length <= 6) {
    return buffer.readUIntBE(0, buffer.length);
  }

  const value = buffer.readBigUInt64BE(0);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : buffer.toString('hex');
}

function readIoElements(reader, valueSize, io) {
  const count = reader.uint16();

  for (let index = 0; index < count; index += 1) {
    const id = reader.uint16();
    io[id] = decodeIoValue(reader.bytes(valueSize));
  }

  return count;
}

function parseRecord(reader) {
  const start = reader.offset;
  const timestampMs = reader.uint64();
  const priority = reader.uint8();
  const longitude = reader.int32() / 10_000_000;
  const latitude = reader.int32() / 10_000_000;
  const altitude = reader.uint16();
  const angle = reader.uint16();
  const satellites = reader.uint8();
  const speed = reader.uint16();
  const eventIoId = reader.uint16();
  const declaredIoCount = reader.uint16();
  const io = {};
  let decodedIoCount = 0;

  decodedIoCount += readIoElements(reader, 1, io);
  decodedIoCount += readIoElements(reader, 2, io);
  decodedIoCount += readIoElements(reader, 4, io);
  decodedIoCount += readIoElements(reader, 8, io);

  const variableCount = reader.uint16();
  decodedIoCount += variableCount;

  for (let index = 0; index < variableCount; index += 1) {
    const id = reader.uint16();
    const length = reader.uint16();
    io[id] = reader.bytes(length).toString('hex');
  }

  if (declaredIoCount !== decodedIoCount) {
    throw new Error(`Numero de elementos IO invalido: ${declaredIoCount}/${decodedIoCount}`);
  }

  const timestampNumber = Number(timestampMs);
  const timestamp = Number.isSafeInteger(timestampNumber)
    ? new Date(timestampNumber)
    : null;

  if (!timestamp || Number.isNaN(timestamp.getTime())) {
    throw new Error('Timestamp AVL invalido');
  }

  const end = reader.offset;

  return {
    timestamp,
    priority,
    gps: {
      longitude,
      latitude,
      altitude,
      angle,
      satellites,
      speed
    },
    eventIoId,
    io,
    raw: reader.buffer.subarray(start, end)
  };
}

function parseCodec8ExtendedFrame(frame) {
  if (!Buffer.isBuffer(frame) || frame.length < 13) {
    throw new Error('Trama AVL demasiado corta');
  }

  if (frame.readUInt32BE(0) !== 0) {
    throw new Error('Preambulo AVL invalido');
  }

  const dataLength = frame.readUInt32BE(4);

  if (dataLength < 3 || dataLength > MAX_AVL_DATA_LENGTH) {
    throw new Error(`Longitud AVL invalida: ${dataLength}`);
  }

  if (frame.length !== 8 + dataLength + 4) {
    throw new Error('La longitud de la trama AVL no coincide');
  }

  const data = frame.subarray(8, 8 + dataLength);
  const receivedCrc = frame.readUInt32BE(8 + dataLength);
  const expectedCrc = crc16Ibm(data);

  if (receivedCrc !== expectedCrc) {
    throw new Error('CRC AVL invalido');
  }

  const reader = new BufferReader(data);
  const codecId = reader.uint8();

  if (codecId !== CODEC_8_EXTENDED) {
    throw new Error(`Codec no soportado: 0x${codecId.toString(16)}`);
  }

  const recordCount = reader.uint8();
  const records = [];

  for (let index = 0; index < recordCount; index += 1) {
    records.push(parseRecord(reader));
  }

  const repeatedRecordCount = reader.uint8();

  if (recordCount !== repeatedRecordCount) {
    throw new Error(`Contadores AVL distintos: ${recordCount}/${repeatedRecordCount}`);
  }

  if (reader.offset !== data.length) {
    throw new Error('La trama AVL contiene bytes adicionales');
  }

  return { codecId, recordCount, records };
}

module.exports = {
  CODEC_8_EXTENDED,
  MAX_AVL_DATA_LENGTH,
  crc16Ibm,
  parseCodec8ExtendedFrame
};
