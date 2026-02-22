import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { agentRouter } from './routes/agent.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/error-handler.js';
import type { Logger } from './logger.js';

export function createApp(logger: Logger) {
  const app = express();

  // ── Body parsing ──
  app.use(express.json({ limit: '500kb' }));

  // ── Logging middleware ──
  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url }, 'incoming request');
    next();
  });

  // ── Rate limiting for agent endpoint ──
  app.use(
    '/api/agent',
    rateLimit({
      windowMs: 60_000,
      max: Number(process.env.RATE_LIMIT_RPM) || 30,
      keyGenerator: (req) =>
        (req.headers['x-github-token'] as string) || req.ip || 'unknown',
      message: { error: 'Rate limit exceeded. Try again in a minute.' },
    }),
  );

  // ── Routes ──
  app.use('/health', healthRouter);
  app.use('/api/agent', agentRouter);

  // ── Error handler ──
  app.use(errorHandler);

  return app;
}
