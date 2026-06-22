const express = require('express');
const { renderIndex } = require('../controllers/page.controller');

const router = express.Router();

router.get('/', renderIndex);
router.get('/dashboard', renderIndex);
router.get('/historico', renderIndex);
router.get('/tracker', renderIndex);

module.exports = router;
