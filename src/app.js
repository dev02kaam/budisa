const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const trackerController = require('./controllers/tracker.controller');
const apiRoutes = require('./routes/api.routes');
const authRoutes = require('./routes/auth.routes');
const viewRoutes = require('./routes/view.routes');
const { config } = require('./config/env');
const { requireAppSession, requireCsrfForUnsafeMethods } = require('./middleware/app-auth.middleware');
const { notFound, errorHandler } = require('./middleware/error.middleware');

const app = express();

app.disable('x-powered-by');
if (config.nodeEnv === 'production') app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(compression());
app.use(cookieParser());
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'budisa' });
});
app.post('/tracker', express.json(trackerController.rawJsonOptions), trackerController.ingestTracker);
app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 50 }));

app.use('/auth', authRoutes);
app.use('/vendor/leaflet', express.static(path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist'), {
  dotfiles: 'ignore',
  index: false,
  maxAge: '7d'
}));
app.use(express.static(path.join(__dirname, '..', 'public'), { dotfiles: 'ignore', index: false }));

app.use('/api', requireAppSession, requireCsrfForUnsafeMethods, apiRoutes);
app.use('/', viewRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
