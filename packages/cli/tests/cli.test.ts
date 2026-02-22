import { describe, it, expect } from 'vitest';

describe('CLI smoke test', () => {
  it('module loads without errors', async () => {
    // Verify the CLI module can be imported
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });
});
