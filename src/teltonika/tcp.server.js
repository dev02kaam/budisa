const net = require('net');
const {
  MAX_AVL_DATA_LENGTH,
  parseCodec8ExtendedFrame
} = require('./codec8e');

const MAX_IMEI_LENGTH = 32;

function formatRemoteAddress(socket) {
  return `${socket.remoteAddress || 'desconocida'}:${socket.remotePort || 0}`;
}

function createSession(socket, onPacket, logger) {
  let buffer = Buffer.alloc(0);
  let imei = null;
  let processing = false;
  let ended = false;

  function reject(message) {
    logger.warn(`[Teltonika] ${formatRemoteAddress(socket)} rechazado: ${message}`);
    ended = true;
    socket.destroy();
  }

  async function processBuffer() {
    if (processing || ended) {
      return;
    }

    processing = true;

    try {
      while (!ended) {
        if (!imei) {
          if (buffer.length < 2) {
            break;
          }

          const imeiLength = buffer.readUInt16BE(0);

          if (imeiLength < 1 || imeiLength > MAX_IMEI_LENGTH) {
            reject(`longitud IMEI invalida: ${imeiLength}`);
            break;
          }

          if (buffer.length < 2 + imeiLength) {
            break;
          }

          imei = buffer.subarray(2, 2 + imeiLength).toString('ascii');
          buffer = buffer.subarray(2 + imeiLength);

          if (!/^\d{15}$/.test(imei)) {
            reject(`IMEI invalido: ${imei}`);
            break;
          }

          socket.write(Buffer.from([0x01]));
          logger.info(`[Teltonika] FTC880 conectado. IMEI=${imei} origen=${formatRemoteAddress(socket)}`);
          continue;
        }

        if (buffer.length < 8) {
          break;
        }

        if (buffer.readUInt32BE(0) !== 0) {
          reject('preambulo AVL invalido');
          break;
        }

        const dataLength = buffer.readUInt32BE(4);

        if (dataLength < 3 || dataLength > MAX_AVL_DATA_LENGTH) {
          reject(`longitud AVL invalida: ${dataLength}`);
          break;
        }

        const frameLength = 8 + dataLength + 4;

        if (buffer.length < frameLength) {
          break;
        }

        const frame = buffer.subarray(0, frameLength);
        buffer = buffer.subarray(frameLength);
        const packet = parseCodec8ExtendedFrame(frame);
        const accepted = await onPacket({ imei, ...packet });
        const acceptedCount = Number.isInteger(accepted)
          ? Math.max(0, Math.min(accepted, packet.recordCount))
          : packet.recordCount;
        const acknowledgement = Buffer.alloc(4);
        acknowledgement.writeUInt32BE(acceptedCount);
        socket.write(acknowledgement);
        logger.info(`[Teltonika] IMEI=${imei} registros=${packet.recordCount} aceptados=${acceptedCount}`);
      }
    } catch (error) {
      reject(error.message);
    } finally {
      processing = false;
    }
  }

  socket.setKeepAlive(true, 30_000);
  socket.setTimeout(5 * 60_000);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  });

  socket.on('timeout', () => {
    logger.info(`[Teltonika] Conexion inactiva cerrada. IMEI=${imei || 'pendiente'}`);
    ended = true;
    socket.end();
  });

  socket.on('error', (error) => {
    logger.warn(`[Teltonika] Error de conexion IMEI=${imei || 'pendiente'}: ${error.message}`);
  });
}

function startTeltonikaTcpServer({ port, onPacket, host = '0.0.0.0', logger = console }) {
  if (typeof onPacket !== 'function') {
    throw new Error('onPacket es obligatorio');
  }

  return new Promise((resolve, reject) => {
    const sockets = new Set();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      createSession(socket, onPacket, logger);
    });

    server.destroyConnections = () => {
      for (const socket of sockets) {
        socket.destroy();
      }
    };

    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      const address = server.address();
      logger.info(`[Teltonika] Receptor Codec 8 Extended escuchando en ${host}:${address.port}/TCP`);
      resolve(server);
    });
  });
}

module.exports = { startTeltonikaTcpServer };
