const express = require('express');
const cors = require('cors');
const path = require('path');
const trackerController = require('./controllers/tracker.controller');
const apiRoutes = require('./routes/api.routes');
const viewRoutes = require('./routes/view.routes');
const { notFound, errorHandler } = require('./middleware/error.middleware');

const app = express();

app.use(cors());
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'budisa' });
});
app.post('/tracker', express.json(trackerController.rawJsonOptions), trackerController.ingestTracker);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRoutes);
app.use('/', viewRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
