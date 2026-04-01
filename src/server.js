const path = require('path');
const express = require('express');

const db = require('./db/database');
const api = require('./routes/api');

// Seed defaults on first run
try {
  const count = db.prepare('SELECT COUNT(*) AS c FROM templates').get().c;
  if (count === 0) {
    require('./db/seed');
    console.log('[db] Seeded default template.');
  }
} catch (e) {
  console.error('[db] Seed check failed:', e.message);
}

const app = express();
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

app.use(express.json({ limit: '2mb' }));
app.use('/api', api);
app.use(express.static(publicDir));

// Serve uploads/backgrounds
app.use('/files', express.static(path.join(root, 'uploads')));
app.use('/imports', express.static(path.join(root, 'imports')));

const PORT = Number(process.env.PORT) || 3847;
const server = app.listen(PORT, () => {
  console.log(`Local Label Studio running at http://127.0.0.1:${PORT}`);
  console.log('Offline — no cloud, no telemetry.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use (another Local Label Studio or app is running).\n` +
        '  Fix: close that window, or end the process in Task Manager, or use a different port:\n' +
        '  PowerShell:  $env:PORT=3850; npm start'
    );
    process.exit(1);
  }
  throw err;
});
