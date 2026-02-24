import { createHash } from 'node:crypto';
import type { ToolProposal } from '../types.js';

/**
 * Computes a hash representing only the interactive surface of a tool.
 * Ignore non-interactive shapes or details like `className`, stylistic changes, or surrounding divs.
 */
export function hashInteractiveSurface(tool: ToolProposal): string {
    const signature = {
        c: tool.sourceMapping.componentName,
        e: tool.sourceMapping.inputElements.map(el => ({
            t: el.tag,
            n: el.name,
            i: el.inputType,
            l: el.label,
            s: el.stateBinding != null
        })),
        t: tool.sourceMapping.triggerElement ? {
            t: tool.sourceMapping.triggerElement.tag,
            n: tool.sourceMapping.triggerElement.name,
            l: tool.sourceMapping.triggerElement.label
        } : null,
        h: tool.sourceMapping.handler ? {
            n: tool.sourceMapping.handler.name,
            ev: tool.sourceMapping.handler.event
        } : null,
        schema: tool.inputSchema
    };

    return createHash('sha256')
        .update(JSON.stringify(signature))
        .digest('hex');
}
