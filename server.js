const app = require('./src/app');
const { connectDb, disconnectDb } = require('./src/config/db');
const { config } = require('./src/config/env');
const { ingestPacket } = require('./src/services/teltonika.service');
const { startTeltonikaTcpServer } = require('./src/teltonika/tcp.server');

let httpServer = null;
let teltonikaServer = null;
let shuttingDown = false;

function listenHttp(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0');

    server.once('error', reject);
    server.once('listening', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function closeServer(server) {
  if (!server?.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.close(resolve);
    server.destroyConnections?.();
    server.closeAllConnections?.();
  });
}

async function bootstrap() {
  const dbInfo = await connectDb();
  httpServer = await listenHttp(config.port);
  console.log(`Budisa API listening on 0.0.0.0:${config.port}`);
  console.log(`Base de datos: ${dbInfo.mode}`);

  if (config.teltonikaTcpEnabled) {
    teltonikaServer = await startTeltonikaTcpServer({
      port: config.teltonikaTcpPort,
      onPacket: ingestPacket
    });
  } else {
    console.log('[Teltonika] Receptor TCP local desactivado; se usara el gateway HTTPS de Railway.');
  }
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Cerrando Budisa (${signal})...`);

  await Promise.all([
    closeServer(teltonikaServer),
    closeServer(httpServer)
  ]).catch(() => {});
  await disconnectDb().catch(() => {});
  process.exit(0);
}

bootstrap().catch(async (error) => {
  console.error('No se pudo iniciar el servidor:', error);
  await closeServer(teltonikaServer).catch(() => {});
  await closeServer(httpServer).catch(() => {});
  await disconnectDb().catch(() => {});
  process.exit(1);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
