import { test, expect } from '@playwright/test';

/**
 * These tests verify that the Vite plugin's virtual module injection works
 * end-to-end against a live dev server (test-react app on :5173).
 *
 * They test both the native Chrome WebMCP path (navigator.modelContext)
 * and the polyfill fallback path (window.mcp).
 */

const DEV_URL = 'http://localhost:5173';

test.describe('Native WebMCP Protocol (navigator.modelContext)', () => {

    test('registers tools via navigator.modelContext when available', async ({ page }) => {
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        // 1. Mock navigator.modelContext BEFORE the page loads.
        //    addInitScript runs in the page context before any script executes.
        await page.addInitScript(() => {
            const registeredTools = new Map();

            Object.defineProperty(navigator, 'modelContext', {
                value: {
                    tools: registeredTools,
                    registerTool(tool: any) {
                        registeredTools.set(tool.name, tool);
                    }
                },
                configurable: true,
                writable: true
            });

            // Expose a flag so we can verify the mock was active
            (window as any).__nativeMcpMocked = true;
        });

        // 2. Load the app — the virtual module will detect modelContext and use it
        await page.goto(DEV_URL);
        await page.waitForLoadState('networkidle');

        // 3. Wait for the virtual module to execute (script in body loads after DOM)
        await page.waitForFunction(() => {
            return (window as any).__nativeMcpMocked === true &&
                (navigator as any).modelContext?.tools?.size > 0;
        }, null, { timeout: 10000 });

        // 4. Assert tools were registered through the NATIVE path
        const nativeResult = await page.evaluate(() => {
            const mc = (navigator as any).modelContext;
            return {
                hasModelContext: !!mc,
                toolCount: mc?.tools?.size ?? 0,
                toolNames: mc ? Array.from(mc.tools.keys()).sort() : []
            };
        });

        expect(nativeResult.hasModelContext).toBe(true);
        expect(nativeResult.toolCount).toBeGreaterThan(0);
        expect(nativeResult.toolNames).toContain('submit_my_form');

        // 5. Assert window.mcp was NOT populated (native path takes priority).
        //    The generated code only creates window.mcp in the else branch,
        //    so it shouldn't exist at all when modelContext is present.
        const mcpExists = await page.evaluate(() => {
            return typeof (window as any).mcp !== 'undefined' &&
                typeof (window as any).mcp.registerTool === 'function';
        });

        // window.mcp should not have been created since native path was used
        expect(mcpExists).toBe(false);
    });

    test('tool registered via native path has correct schema and handler', async ({ page }) => {
        // 1. Mock navigator.modelContext
        await page.addInitScript(() => {
            const registeredTools = new Map();

            Object.defineProperty(navigator, 'modelContext', {
                value: {
                    tools: registeredTools,
                    registerTool(tool: any) {
                        registeredTools.set(tool.name, tool);
                    }
                },
                configurable: true,
                writable: true
            });
        });

        // 2. Load app and wait for tools
        await page.goto(DEV_URL);
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => {
            return (navigator as any).modelContext?.tools?.size > 0;
        }, null, { timeout: 10000 });

        // 3. Inspect the registered tool's structure
        const toolInfo = await page.evaluate(() => {
            const tool = (navigator as any).modelContext.tools.get('submit_my_form');
            if (!tool) return null;
            return {
                name: tool.name,
                hasId: typeof tool.id === 'string' && tool.id.length > 0,
                hasDescription: typeof tool.description === 'string' && tool.description.length > 0,
                hasHandler: typeof tool.handler === 'function',
                hasInputSchema: !!tool.inputSchema,
                schemaType: tool.inputSchema?.type,
                hasProperties: !!tool.inputSchema?.properties,
                hasRequired: Array.isArray(tool.inputSchema?.required)
            };
        });

        expect(toolInfo).not.toBeNull();
        expect(toolInfo!.name).toBe('submit_my_form');
        expect(toolInfo!.hasId).toBe(true);
        expect(toolInfo!.hasDescription).toBe(true);
        expect(toolInfo!.hasHandler).toBe(true);
        expect(toolInfo!.hasInputSchema).toBe(true);
        expect(toolInfo!.schemaType).toBe('object');
        expect(toolInfo!.hasProperties).toBe(true);
        expect(toolInfo!.hasRequired).toBe(true);
    });
});

test.describe('Polyfill Fallback (window.mcp)', () => {

    test('falls back to window.mcp when navigator.modelContext is absent', async ({ page }) => {
        // 1. Load WITHOUT mocking modelContext — should use window.mcp fallback.
        //    The generated code creates: window.mcp = window.mcp || { registerTool: () => {} }
        //    and then calls window.mcp.registerTool(tool_...).
        //    By default, the stub registerTool is a no-op, so we need to hook it.
        await page.addInitScript(() => {
            // Pre-create window.mcp with a tracking registerTool BEFORE the
            // virtual module loads, so it uses our tracker instead of the stub.
            const registeredTools = new Map();
            (window as any).mcp = {
                tools: registeredTools,
                registerTool(tool: any) {
                    registeredTools.set(tool.name, tool);
                }
            };
        });

        await page.goto(DEV_URL);
        await page.waitForLoadState('networkidle');

        // 2. Wait for tools to register
        await page.waitForFunction(() => {
            return (window as any).mcp?.tools?.size > 0;
        }, null, { timeout: 10000 });

        // 3. Assert tools registered via window.mcp
        const fallbackResult = await page.evaluate(() => {
            const mcp = (window as any).mcp;
            return {
                hasMcp: !!mcp,
                toolCount: mcp?.tools?.size ?? 0,
                toolNames: mcp ? Array.from(mcp.tools.keys()).sort() : [],
            };
        });

        expect(fallbackResult.hasMcp).toBe(true);
        expect(fallbackResult.toolCount).toBeGreaterThan(0);
        expect(fallbackResult.toolNames).toContain('submit_my_form');

        // 4. Confirm navigator.modelContext is NOT present
        const hasNative = await page.evaluate(() => {
            return 'modelContext' in navigator;
        });

        expect(hasNative).toBe(false);
    });
});

test.describe('Virtual Module Injection (/@id/)', () => {

    test('virtual module is served via /@id/ URL with no CORS errors', async ({ page }) => {
        // 1. Collect console errors
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        page.on('pageerror', err => errors.push(err.message));

        // 2. Load the app
        await page.goto(DEV_URL);
        await page.waitForLoadState('networkidle');

        // 3. No CORS or scheme errors
        const corsErrors = errors.filter(e =>
            e.includes('CORS') ||
            e.includes('virtual:') ||
            e.includes('unsupported scheme')
        );
        expect(corsErrors).toHaveLength(0);

        // 4. The /@id/ script tag was injected into HTML
        const scriptTag = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script[type="module"]');
            return Array.from(scripts)
                .map(s => s.getAttribute('src'))
                .filter(src => src && src.includes('webmcp'));
        });

        expect(scriptTag.length).toBeGreaterThan(0);
        expect(scriptTag[0]).toContain('/@id/virtual:webmcp-tools');
    });
});
