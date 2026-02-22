import type { ToolProposal, UIElement } from '../types.js';
import { buildSelector, buildSetCall, buildSubmitCall } from '../generator/framework-helpers.js';

// ── LLM prompts ───────────────────────────────────────────────

export function buildHandlerPrompt(tool: ToolProposal): string {
    const fields = Object.entries(tool.inputSchema.properties)
        .map(([k, v]) => `  - ${k} (${(v as { type: string }).type}): ${(v as { description: string }).description}`)
        .join('\n');

    const selectors = tool.sourceMapping.inputElements
        .map(el => `  - ${buildSelector(el)} → ${el.label ?? el.name ?? el.id ?? el.tag}`)
        .join('\n');

    const triggerSel = tool.sourceMapping.triggerElement
        ? buildSelector(tool.sourceMapping.triggerElement)
        : 'unknown';

    // ── Key improvement: use the actual handler body as context ──
    const handler = tool.sourceMapping.handler;
    let handlerContext = '';

    if (handler?.body) {
        handlerContext = `\nOriginal handler source (${handler.name}):\n\`\`\`javascript\n${handler.body.slice(0, 600)}\n\`\`\``;
    }

    if (handler?.apiCalls && handler.apiCalls.length > 0) {
        const calls = handler.apiCalls
            .map(c => `  ${c.method} ${c.url}`)
            .join('\n');
        handlerContext += `\nAPI calls made by this handler:\n${calls}`;
    }

    return `You are generating a JavaScript handler for an MCP (Model Context Protocol) tool.

Tool name: ${tool.name}
Description: ${tool.description}

Input parameters (what the AI agent will provide):
${fields || '  (none)'}

DOM selectors to use:
${selectors || '  (none — use the submit trigger directly'}
Trigger selector: ${triggerSel}
${handlerContext}
Available DOM helpers (already in scope):
- __mcpSetValue(selector, value) — sets input/textarea value, fires React change events
- __mcpSetChecked(selector, checked) — sets checkbox state
- __mcpSetSelect(selector, value) — sets select dropdown value
- __mcpClick(selector) — clicks a button or element

Generate ONLY the async handler body (statements inside async (params) => { ... }).
Requirements:
1. Fill each input field using the matching param value and the selector above
2. After filling all fields, trigger the action using __mcpClick on the trigger selector
3. Return { success: true, message: '...' } on success
4. Wrap everything in try/catch, return { success: false, message: err.message } on error
5. Use ONLY the selectors listed — do not invent selectors
6. If the handler makes an API call (listed above), reflect that in the success message

Output ONLY the handler body. No markdown, no function declaration, no explanation.`;
}

// ── Template handler (no LLM) ─────────────────────────────────

/**
 * Build a deterministic template handler from AST data — no LLM.
 * Uses the concrete selectors already found by the parser.
 */
export function buildTemplateHandler(tool: ToolProposal): string {
    const lines: string[] = ['try {'];

    // Fill each input field
    for (const el of tool.sourceMapping.inputElements) {
        const paramName = el.name ?? el.id ?? el.stateBinding?.variable ?? el.label;
        if (!paramName) continue;
        const safeParam = toSafeKey(paramName);
        const setCall = buildSetCall(el, `params.${safeParam}`);
        lines.push(`  ${setCall};`);
    }

    // Give React a tick to process state updates
    if (tool.sourceMapping.inputElements.length > 0) {
        lines.push(`  await new Promise(r => setTimeout(r, 100));`);
    }

    // Trigger the action
    const triggerCall = buildSubmitCall(tool.sourceMapping.triggerElement);
    if (triggerCall && !triggerCall.startsWith('/*')) {
        lines.push(`  ${triggerCall};`);
    }

    // Build a meaningful success message from API call info if available
    const apiCalls = tool.sourceMapping.handler?.apiCalls;
    const successMsg = apiCalls && apiCalls.length > 0
        ? `${tool.sourceMapping.handler?.name ?? 'Action'} triggered (${apiCalls[0].method} ${apiCalls[0].url})`
        : 'Action completed successfully';

    lines.push(`  return { success: true, message: ${JSON.stringify(successMsg)} };`);
    lines.push(`} catch (err) {`);
    lines.push(`  return { success: false, message: err instanceof Error ? err.message : String(err) };`);
    lines.push(`}`);

    return lines.join('\n');
}

// ── LLM handler generation ────────────────────────────────────

import type { LLMAdapter } from '../types.js';

export async function generateHandlerWithLLM(
    tool: ToolProposal,
    llm: LLMAdapter,
): Promise<string> {
    // Template-mode adapters skip the LLM call entirely
    if (llm.name === 'Template-only (no LLM)') {
        return buildTemplateHandler(tool);
    }

    const prompt = buildHandlerPrompt(tool);

    try {
        const body = await llm.generate([
            {
                role: 'system',
                content: 'You are a precise JavaScript code generator. Output only the requested code. No markdown, no explanation.',
            },
            {
                role: 'user',
                content: prompt,
            },
        ], { temperature: 0.1, maxTokens: 800 });

        // Sanity check: must contain a return statement
        if (!body || !body.includes('return')) {
            console.warn(`[WebMCP] LLM returned invalid handler — falling back to template`);
            return buildTemplateHandler(tool);
        }

        return body.trim();
    } catch (err) {
        console.warn(`[WebMCP] LLM error (${(err as Error).message}) — falling back to template`);
        return buildTemplateHandler(tool);
    }
}

// ── Utilities ─────────────────────────────────────────────────

function toSafeKey(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}
