const { connectDb, disconnectDb } = require('../src/config/db');
const { registerTracker } = require('../src/services/tracker-gateway.service');

async function run() {
  const [imei, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim();

  if (!imei || !name) {
    throw new Error('Uso: npm run tracker:register -- <imei> <nombre>');
  }

  await connectDb();
  const tracker = await registerTracker({ imei, name });
  console.log(`Dispositivo registrado: ${tracker.name} (${tracker.imei})`);
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb().catch(() => {});
  });
