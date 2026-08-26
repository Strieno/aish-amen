import { createApp } from './app.js';
import { DATA_DIR } from './db/index.js';
import { logEvent } from './db/index.js';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  logEvent('error', 'app', `Unhandled rejection: ${reason?.message || reason}`);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  logEvent('error', 'app', `Uncaught exception: ${err.message}`);
});

const PORT = Number(process.env.PORT || 4321);

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Aish Aman OS server running at http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  logEvent('info', 'app', `Server listening on port ${PORT}`);
});

server.on('error', (e) => {
  console.error('Server error:', e.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
