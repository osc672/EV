import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { initSocketServer } from './lib/socket';
import { ensureProvidersApproved } from './modules/providers/providers.service';

async function main() {
  await connectDatabase();
  await ensureProvidersApproved();

  const app = createApp();
  const server = createServer(app);
  initSocketServer(server);

  server.listen(env.PORT, () => {
    logger.info('server_started', {
      port: env.PORT,
      env: env.NODE_ENV,
      docs: `http://localhost:${env.PORT}/docs`,
      api: `http://localhost:${env.PORT}${env.API_PREFIX}`,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info('shutdown_started', { signal });
    server.close(async () => {
      await disconnectDatabase();
      logger.info('shutdown_complete');
      process.exit(0);
    });
    // Force-exit if graceful shutdown stalls.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled_rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('uncaught_exception', { message: err.message, stack: err.stack });
  });
}

main().catch((err) => {
  logger.error('startup_failed', { message: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
