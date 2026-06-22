function renderIndex(req, res) {
  res.sendFile(require('path').join(__dirname, '..', '..', 'public', 'index.html'));
}

module.exports = { renderIndex };
