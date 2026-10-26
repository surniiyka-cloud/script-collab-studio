import { makeApp } from './server.js';
import { createCollabServer } from './collab.js';
import { env } from './env.js';
import { db } from './db.js';

const api = makeApp();
const collab = createCollabServer();
async function shutdown() {
  await collab.destroy(); // Flushes queued Yjs persistence hooks on graceful shutdown.
  await api.close();
  await db.$disconnect();
}
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
try {
  await api.listen({ port: env.PORT, host: env.HOST });
  await collab.listen();
} catch (error) {
  api.log.error(error);
  await shutdown();
  process.exitCode = 1;
}
