import { describe, it, expect } from 'vitest';
import { parseHTMLFile } from '../src/parser/html-parser.js';
import { buildProposals } from '../src/proposal/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixturesDir = resolve(__dirname, '../../../test/fixtures/html');

// ── contact.html ──────────────────────────────────────────────

describe('HTML parser — contact.html', () => {
    const source = readFileSync(resolve(fixturesDir, 'contact.html'), 'utf-8');
    const analysis = parseHTMLFile(source, 'contact.html');

    it('detects framework as html', () => {
        expect(analysis.framework).toBe('html');
    });

    it('finds 1 component', () => {
        expect(analysis.components).toHaveLength(1);
    });

    it('finds at least 4 interactive elements (name, email, subject, message, button)', () => {
        const elements = analysis.components[0]!.elements;
        // form + input name + input email + select subject + textarea message + button
        expect(elements.length).toBeGreaterThanOrEqual(4);
    });

    it('detects inputs with id attributes', () => {
        const elements = analysis.components[0]!.elements;
        const withIds = elements.filter(el => el.id);
        expect(withIds.length).toBeGreaterThan(0);
    });

    it('captures "Send Message" as the button label', () => {
        const elements = analysis.components[0]!.elements;
        const button = elements.find(el => el.tag === 'button');
        expect(button?.label).toBe('Send Message');
    });

    it('identifies component type as form', () => {
        expect(analysis.components[0]!.type).toBe('form');
    });

    it('validation: required fields are marked', () => {
        const elements = analysis.components[0]!.elements;
        const nameInput = elements.find(el => el.name === 'name');
        expect(nameInput?.validation).toContain('required');
    });
});

// ── dashboard.html (display-only) ────────────────────────────

describe('HTML parser — dashboard.html', () => {
    const source = readFileSync(resolve(fixturesDir, 'dashboard.html'), 'utf-8');
    const analysis = parseHTMLFile(source, 'dashboard.html');

    it('returns 0 components for display-only HTML', () => {
        expect(analysis.components).toHaveLength(0);
    });
});

// ── HTML proposals ────────────────────────────────────────────

describe('buildProposals — contact.html', () => {
    const source = readFileSync(resolve(fixturesDir, 'contact.html'), 'utf-8');
    const analysis = parseHTMLFile(source, 'contact.html');
    const proposals = buildProposals(analysis);

    it('generates at least 1 proposal', () => {
        expect(proposals.length).toBeGreaterThanOrEqual(1);
    });

    it('contact form proposal has input schema', () => {
        expect(Object.keys(proposals[0]!.inputSchema.properties).length).toBeGreaterThan(0);
    });

    it('contact form risk is caution or safe', () => {
        expect(['safe', 'caution']).toContain(proposals[0]!.risk);
    });
});
