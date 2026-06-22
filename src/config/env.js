require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 3002),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/budisa',
  useMemoryMongo: String(process.env.USE_MEMORY_MONGO || 'false').toLowerCase() === 'true',
  nodeEnv: process.env.NODE_ENV || 'development'
};

module.exports = { config };
