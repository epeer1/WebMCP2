import type { ToolProposal, UIElement } from '../types.js';
import { buildSelector, buildSetCall, buildSubmitCall } from '../generator/framework-helpers.js';

// ── LLM prompts ───────────────────────────────────────────────

export function buildHandlerPrompt(tool: ToolProposal, sourceExcerpt?: string): string {
    const fields = Object.entries(tool.inputSchema.properties)
        .map(([k, v]) => `  - ${k} (${(v as any).type}): ${(v as any).description}`)
        .join('\n');

    const selectors = tool.sourceMapping.inputElements
        .map(el => `  - ${buildSelector(el)} → ${el.label ?? el.name ?? el.id ?? el.tag}`)
        .join('\n');

    const triggerSel = tool.sourceMapping.triggerElement
        ? buildSelector(tool.sourceMapping.triggerElement)
        : 'unknown';

    return `You are generating a JavaScript handler for an MCP (Model Context Protocol) tool.

Tool name: ${tool.name}
Description: ${tool.description}

Input parameters:
${fields || '  (none)'}

Known DOM selectors:
${selectors || '  (none)'}
Trigger selector: ${triggerSel}

Available DOM helpers (already defined in scope):
- __mcpSetValue(selector, value) — sets input/textarea value, triggers React events
- __mcpSetChecked(selector, checked) — sets checkbox state
- __mcpSetSelect(selector, value) — sets select dropdown value
- __mcpClick(selector) — clicks a button/element

${sourceExcerpt ? `Source context:\n\`\`\`tsx\n${sourceExcerpt.slice(0, 800)}\n\`\`\`` : ''}

Generate ONLY the async handler function body (the code inside async (params) => { ... }).
Requirements:
1. Use the helpers above to fill each input field using the params values
2. After filling fields, trigger the submit/action
3. Return { success: true, message: '...' } on success
4. Wrap in try/catch, return { success: false, message: err.message } on error
5. Use ONLY the selectors listed above — do not invent new ones
6. Do NOT include any function declaration — just the body statements

Respond with ONLY the handler body code. No markdown, no explanation.`;
}

// ── Template handler (no LLM) ─────────────────────────────────

/**
 * Build a template handler body from AST data alone — no LLM needed.
 * Produces valid but generic handler code using the known selectors.
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

    // Trigger the action
    const triggerCall = buildSubmitCall(tool.sourceMapping.triggerElement);
    if (triggerCall && !triggerCall.startsWith('/*')) {
        lines.push(`  // Small delay to let React process state updates`);
        lines.push(`  await new Promise(r => setTimeout(r, 100));`);
        lines.push(`  ${triggerCall};`);
    }

    lines.push(`  return { success: true, message: 'Action completed successfully' };`);
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
    sourceExcerpt?: string,
): Promise<string> {
    const prompt = buildHandlerPrompt(tool, sourceExcerpt);

    try {
        const body = await llm.generate([
            {
                role: 'system',
                content: 'You are a precise code generator. Output only the requested code, no markdown fences, no explanation.',
            },
            {
                role: 'user',
                content: prompt,
            },
        ], { temperature: 0.1 });

        // Basic sanity: must contain a return statement
        if (!body.includes('return')) {
            console.warn(`[WebMCP] LLM handler missing return statement — falling back to template`);
            return buildTemplateHandler(tool);
        }

        return body.trim();
    } catch (err) {
        console.warn(`[WebMCP] LLM handler generation failed — falling back to template. Error: ${(err as Error).message}`);
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
