// ────────────────────────────────────────────────────────────
// webmcp-instrument-runtime — Browser-side WebMCP Runtime
// ────────────────────────────────────────────────────────────
// Provides window.mcp with registerTool(), getTools(), invokeTool()
// Size target: <2KB minified+gzipped
// ────────────────────────────────────────────────────────────

export interface MCPToolResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (params: Record<string, unknown>) => Promise<MCPToolResult> | MCPToolResult;
}

export interface MCPRuntime {
  registerTool(tool: MCPTool): void;
  getTools(): MCPTool[];
  invokeTool(name: string, params: Record<string, unknown>): Promise<MCPToolResult>;
  readonly version: string;
}

const VERSION = '0.1.0';

/**
 * Create the MCP runtime instance.
 * Can be used standalone in tests or auto-attached to window.
 */
export function createMCPRuntime(): MCPRuntime {
  const tools = new Map<string, MCPTool>();

  return {
    version: VERSION,

    registerTool(tool: MCPTool): void {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error('[WebMCP] Tool must have a non-empty string "name"');
      }
      if (typeof tool.handler !== 'function') {
        throw new Error(`[WebMCP] Tool "${tool.name}" must have a "handler" function`);
      }
      if (tools.has(tool.name)) {
        console.warn(`[WebMCP] Tool "${tool.name}" already registered. Overwriting.`);
      }
      tools.set(tool.name, tool);

      // Notify listeners
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('mcp:tool-registered', { detail: { name: tool.name } }),
        );
      }
    },

    getTools(): MCPTool[] {
      return Array.from(tools.values()).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        handler: t.handler,
      }));
    },

    async invokeTool(name: string, params: Record<string, unknown>): Promise<MCPToolResult> {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`[WebMCP] Tool "${name}" not found. Available: ${Array.from(tools.keys()).join(', ')}`);
      }
      try {
        return await tool.handler(params);
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

// ── Auto-init on window if in browser context ──────────────

function autoInit(): void {
  if (typeof window === 'undefined') return;

  // Don't overwrite existing runtime (idempotent)
  if ((window as any).mcp) return;

  (window as any).mcp = createMCPRuntime();
  window.dispatchEvent(new Event('mcp:ready'));
}

autoInit();

// ── Global type augmentation ───────────────────────────────

declare global {
  interface Window {
    mcp: MCPRuntime;
  }
}
