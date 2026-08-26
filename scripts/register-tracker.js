const { connectDb, disconnectDb } = require('../src/config/db');
const { registerTracker } = require('../src/services/tracker-gateway.service');

async function run() {
  const [imei, licensePlate, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim();

  if (!imei || !licensePlate || !name) {
    throw new Error('Uso: npm run tracker:register -- <imei> <matricula> <nombre>');
  }

  await connectDb();
  const tracker = await registerTracker({ imei, name, licensePlate });
  console.log(`Dispositivo registrado: ${tracker.name} · ${tracker.licensePlate} (${tracker.imei})`);
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb().catch(() => {});
  });
