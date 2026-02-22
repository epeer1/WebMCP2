import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Convert the local HTML file path to a file:// URL that Playwright can navigate to
const appUrl = pathToFileURL(resolve(__dirname, '../app.html')).toString();

test.describe('WebMCP Generated Tools E2E', () => {
    test('__mcpSetValue successfully updates React state and __mcpClick submits the form', async ({ page }) => {
        // 1. Load the mock app
        await page.goto(appUrl);

        // Wait for React to render the form
        await expect(page.locator('form')).toBeVisible();

        // 2. Intercept console logs to prove the app received the exact values
        const logs: string[] = [];
        page.on('console', msg => logs.push(msg.text()));

        // 3. Execute the tool exactly as the @webmcp/runtime would
        const result = await page.evaluate(async () => {
            // @ts-expect-error - window.mcp is injected in app.html
            const tool = window.mcp.tools.get('submit_test_form');

            if (!tool) throw new Error('Tool not registered');

            // The AI provides these parameters
            const params = {
                name: 'Alice Agent',
                email: 'alice@agent.ai'
            };

            // Execute the generated handler
            return await tool.handler(params);
        });

        // 4. Assert the handler returned success
        expect(result.success).toBe(true);

        // 5. Assert the DOM updated (React successfully caught the change events and re-rendered the success banner)
        await expect(page.locator('#success-banner')).toBeVisible();
        await expect(page.locator('#success-banner')).toHaveText('Thank you, Alice Agent!');

        // 6. Assert the internal React state had the right values when submitted
        expect(logs).toContain('[App] Submitted: Alice Agent <alice@agent.ai>');
    });
});
