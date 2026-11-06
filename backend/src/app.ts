import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import swaggerUi from 'swagger-ui-express';

import { env, corsOrigins } from './config/env';
import { openApiSpec } from './config/swagger';
import { requestLogger } from './middleware/requestLogger';
import { apiLimiter } from './middleware/rateLimiter';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.use(
    cors({
      origin: corsOrigins === '*' ? true : corsOrigins,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        // Preserve the raw body for webhook signature verification.
        (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(requestLogger);

  // Local development file storage
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // API docs
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, { customSiteTitle: 'EV Rescue API' }),
  );
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));

  app.use(env.API_PREFIX, apiLimiter, routes);

  // Health check for Railway / load balancers
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'EV Rescue API',
      version: '1.0.0',
      docs: '/docs',
      api: env.API_PREFIX,
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
