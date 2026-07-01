const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { config } = require('./env');

let memoryServer = null;

async function connectDb() {
  mongoose.set('strictQuery', true);

  try {
    if (!config.useMemoryMongo) {
      await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 3000
      });
      console.log('MongoDB connected');
      return { mode: 'external', uri: config.mongoUri };
    }
  } catch (error) {
    if (config.nodeEnv === 'production') {
      throw new Error(`No se pudo conectar a MongoDB productiva: ${error.message}`);
    }

    console.warn('No se pudo conectar a MongoDB externa, activando memoria temporal.');
  }

  memoryServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'budisa'
    }
  });

  const uri = memoryServer.getUri();
  await mongoose.connect(uri);
  console.log('MongoDB en memoria conectado');
  return { mode: 'memory', uri };
}

async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectDb, disconnectDb };
