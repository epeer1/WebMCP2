import { describe, it, expect } from 'vitest';
import { NoneAdapter } from '../src/llm/none-adapter.js';
import { buildTemplateHandler } from '../src/generator/handler-generator.js';
import { buildSelectorArray, buildSetCall, buildSubmitCall } from '../src/generator/framework-helpers.js';
import { parseFile } from '../src/parser/index.js';
import { buildProposals } from '../src/proposal/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixturesDir = resolve(__dirname, '../../../test/fixtures/react');

// ── NoneAdapter ───────────────────────────────────────────────

describe('NoneAdapter', () => {
    const adapter = new NoneAdapter();

    it('is always available', async () => {
        expect(await adapter.isAvailable()).toBe(true);
    });

    it('has the correct name', () => {
        expect(adapter.name).toBe('Template-only (no LLM)');
    });

    it('generate() returns empty string (no throw)', async () => {
        const result = await adapter.generate([{ role: 'user', content: 'test' }]);
        expect(typeof result).toBe('string');
        expect(result).toBe('');
    });

    it('generateHandler() returns a valid JS handler string', () => {
        const source = readFileSync(resolve(fixturesDir, 'SettingsPage.tsx'), 'utf-8');
        const analysis = parseFile(source, 'SettingsPage.tsx');
        const proposals = buildProposals(analysis);
        const saveTool = proposals.find(p => p.name.includes('save'));
        expect(saveTool).toBeDefined();

        const handler = adapter.generateHandler(saveTool!);
        expect(handler).toContain('try {');
        expect(handler).toContain('catch (err)');
        expect(handler).toContain('return { success:');
    });
});

// ── buildSelectorArray ─────────────────────────────────────────────

describe('buildSelectorArray priority', () => {
    it('prefers #id when available', () => {
        const el = { tag: 'input', id: 'email', attributes: {} };
        expect(buildSelectorArray(el as any)).toBe('["#email"]');
    });

    it('uses data-testid when no id', () => {
        const el = { tag: 'input', attributes: { 'data-testid': 'email-input' } };
        expect(buildSelectorArray(el as any)).toBe('["[data-testid=\\"email-input\\"]"]');
    });

    it('uses [name] when no id or testid', () => {
        const el = { tag: 'input', name: 'email', attributes: {} };
        expect(buildSelectorArray(el as any)).toBe('["[name=\\"email\\"]"]');
    });

    it('uses aria-label when only that is available', () => {
        const el = {
            tag: 'input',
            attributes: {},
            accessibilityHints: { ariaLabel: 'Search products' },
        };
        expect(buildSelectorArray(el as any)).toBe('["[aria-label=\\"Search products\\"]"]');
    });

    it('falls back to input[type=...] for typed inputs', () => {
        const el = { tag: 'input', inputType: 'search', attributes: {} };
        expect(buildSelectorArray(el as any)).toBe('["input[type=\\"search\\"]"]');
    });
});

// ── buildSetCall ──────────────────────────────────────────────

describe('buildSetCall', () => {
    it('produces __mcpSetValue for text input', () => {
        const el = { tag: 'input', id: 'name', inputType: 'text', attributes: {} };
        expect(buildSetCall(el as any, 'params.name')).toBe('__mcpSetValue(["#name","input[type=\\"text\\"]"], params.name)');
    });

    it('produces __mcpSetChecked for checkbox', () => {
        const el = { tag: 'input', id: 'agree', inputType: 'checkbox', attributes: {} };
        expect(buildSetCall(el as any, 'params.agree')).toBe('__mcpSetChecked(["#agree","input[type=\\"checkbox\\"]"], params.agree)');
    });

    it('produces __mcpSetSelect for select', () => {
        const el = { tag: 'select', id: 'category', attributes: {} };
        expect(buildSetCall(el as any, 'params.category')).toBe('__mcpSetSelect(["#category"], params.category)');
    });
});

// ── buildTemplateHandler — SettingsPage integration ───────────

describe('buildTemplateHandler', () => {
    const source = readFileSync(resolve(fixturesDir, 'SettingsPage.tsx'), 'utf-8');
    const analysis = parseFile(source, 'SettingsPage.tsx');
    const proposals = buildProposals(analysis);

    it('save tool handler uses #display-name selector', () => {
        const save = proposals.find(p => p.name.includes('save'))!;
        const handler = buildTemplateHandler(save);
        expect(handler).toContain('#display-name');
        expect(handler).toContain('__mcpSetValue');
    });

    it('delete tool handler calls __mcpClick', () => {
        const del = proposals.find(p => p.name.includes('delete'))!;
        const handler = buildTemplateHandler(del);
        expect(handler).toContain('__mcpClick');
    });

    it('handler wraps everything in try/catch', () => {
        const save = proposals.find(p => p.name.includes('save'))!;
        const handler = buildTemplateHandler(save);
        expect(handler).toContain('try {');
        expect(handler).toContain('} catch (err) {');
    });

    it('success message includes API call info when available', () => {
        const save = proposals.find(p => p.name.includes('save'))!;
        const handler = buildTemplateHandler(save);
        // handleUpdateProfile calls PUT /api/profile — should be in success msg
        if (save.sourceMapping.handler?.apiCalls?.length) {
            expect(handler).toContain('/api/profile');
        } else {
            // If no api call detected, should still have a success message
            expect(handler).toContain('success: true');
        }
    });
});
