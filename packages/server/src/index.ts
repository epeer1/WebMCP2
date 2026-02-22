import { createApp } from './app.js';
import { createLogger } from './logger.js';

const logger = createLogger();
const port = Number(process.env.PORT) || 3007;

const app = createApp(logger);

app.listen(port, () => {
  logger.info(`WebMCP server listening on http://localhost:${port}`);
  logger.info(`Webhook endpoint: POST http://localhost:${port}/api/agent`);
  logger.info(`Health check:     GET  http://localhost:${port}/health`);
});
