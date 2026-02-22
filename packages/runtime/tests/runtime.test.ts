import { describe, it, expect, beforeEach } from 'vitest';
import { createMCPRuntime, type MCPRuntime } from '../src/index.js';

describe('MCPRuntime', () => {
  let runtime: MCPRuntime;

  beforeEach(() => {
    runtime = createMCPRuntime();
  });

  it('has a version string', () => {
    expect(runtime.version).toBe('0.1.0');
  });

  it('starts with no tools', () => {
    expect(runtime.getTools()).toEqual([]);
  });

  it('registers a tool', () => {
    runtime.registerTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: {}, required: [] },
      handler: async () => ({ success: true }),
    });

    const tools = runtime.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test_tool');
  });

  it('invokes a registered tool', async () => {
    runtime.registerTool({
      name: 'greet',
      description: 'Greet a user',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      handler: async (params) => ({
        success: true,
        message: `Hello, ${params.name}!`,
      }),
    });

    const result = await runtime.invokeTool('greet', { name: 'Alice' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('Hello, Alice!');
  });

  it('throws on invoking non-existent tool', async () => {
    await expect(runtime.invokeTool('nope', {})).rejects.toThrow('Tool "nope" not found');
  });

  it('catches handler errors gracefully', async () => {
    runtime.registerTool({
      name: 'fail',
      description: 'Always fails',
      inputSchema: { type: 'object', properties: {}, required: [] },
      handler: async () => { throw new Error('boom'); },
    });

    const result = await runtime.invokeTool('fail', {});
    expect(result.success).toBe(false);
    expect(result.message).toBe('boom');
  });

  it('overwrites tool with same name', () => {
    const tool1 = {
      name: 'dup',
      description: 'First version',
      inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
      handler: async () => ({ success: true, message: 'v1' }),
    };
    const tool2 = {
      name: 'dup',
      description: 'Second version',
      inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
      handler: async () => ({ success: true, message: 'v2' }),
    };

    runtime.registerTool(tool1);
    runtime.registerTool(tool2);

    expect(runtime.getTools()).toHaveLength(1);
    expect(runtime.getTools()[0].description).toBe('Second version');
  });

  it('rejects tool without name', () => {
    expect(() =>
      runtime.registerTool({
        name: '',
        description: 'bad',
        inputSchema: { type: 'object', properties: {}, required: [] },
        handler: async () => ({ success: true }),
      }),
    ).toThrow('non-empty string "name"');
  });

  it('rejects tool without handler function', () => {
    expect(() =>
      runtime.registerTool({
        name: 'bad',
        description: 'no handler',
        inputSchema: { type: 'object', properties: {}, required: [] },
        handler: 'not a function' as any,
      }),
    ).toThrow('handler');
  });
});
