const { connectDb, disconnectDb } = require('../src/config/db');
const { registerTracker } = require('../src/services/tracker-gateway.service');

async function run() {
  const [imei] = process.argv.slice(2);

  if (!imei) {
    throw new Error('Uso: npm run tracker:register -- <imei>');
  }

  await connectDb();
  const tracker = await registerTracker({ imei });
  console.log(`Tracker registrado por IMEI: ${tracker.imei}`);
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb().catch(() => {});
  });
