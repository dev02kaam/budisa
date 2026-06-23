const app = require('./src/app');
const { connectDb, disconnectDb } = require('./src/config/db');
const { config } = require('./src/config/env');

async function listen(port, dbInfo, retriesLeft = 10) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Budisa API listening on port ${port}`);
      console.log(`Base de datos: ${dbInfo.mode}`);
      resolve(server);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' && retriesLeft > 0) {
        const nextPort = port + 1;
        console.warn(`El puerto ${port} está ocupado. Probando ${nextPort}...`);
        server.close(() => {
          listen(nextPort, dbInfo, retriesLeft - 1).then(resolve).catch(reject);
        });
        return;
      }

      reject(error);
    });
  });
}

async function bootstrap() {
  const dbInfo = await connectDb();
  await listen(config.port, dbInfo);
}

bootstrap().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await disconnectDb().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDb().catch(() => {});
  process.exit(0);
});
