import type { LLMAdapter, LLMMessage, LLMOptions } from '../types.js';
import { buildTemplateHandler } from '../generator/handler-generator.js';
import type { ToolProposal } from '../types.js';

// ── NoneAdapter — always available, no API calls ─────────────

export class NoneAdapter implements LLMAdapter {
    readonly name = 'Template-only (no LLM)';

    async generate(_messages: LLMMessage[]): Promise<string> {
        // Safe no-op — callers should use generateHandler() instead
        return '';
    }

    async generateJSON<T>(_messages: LLMMessage[], _options?: LLMOptions): Promise<T> {
        throw new Error('[NoneAdapter] generateJSON not supported. Use buildTemplateHandler() directly.');
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }

    /**
     * Generate a complete handler body from AST data alone.
     * Returns JS code string — no LLM call made.
     */
    generateHandler(tool: ToolProposal): string {
        return buildTemplateHandler(tool);
    }
}
