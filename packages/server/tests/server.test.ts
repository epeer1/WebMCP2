import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/logger.js';

describe('Server smoke test', () => {
  it('creates Express app without errors', () => {
    const logger = createLogger();
    const app = createApp(logger);
    expect(app).toBeDefined();
  });
});
