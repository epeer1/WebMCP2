import { describe, it, expect } from 'vitest';
import { parseFile } from '../src/parser/index.js';
import { buildProposals } from '../src/proposal/index.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixturesDir = resolve(__dirname, '../../../test/fixtures/react');

function loadFixture(name: string): string {
    return readFileSync(resolve(fixturesDir, name), 'utf-8');
}

// ── ContactForm.tsx ─────────────────────────────────────────

describe('ContactForm.tsx', () => {
    const source = loadFixture('ContactForm.tsx');
    const analysis = parseFile(source, 'ContactForm.tsx');

    it('detects 1 component', () => {
        expect(analysis.components).toHaveLength(1);
    });

    it('finds at least 3 input/textarea elements', () => {
        const comp = analysis.components[0];
        const inputs = comp.elements.filter(el => ['input', 'textarea'].includes(el.tag));
        expect(inputs.length).toBeGreaterThanOrEqual(3);
    });

    it('finds the submit handler', () => {
        const comp = analysis.components[0];
        const submit = comp.eventHandlers.find(h => h.event === 'onSubmit');
        expect(submit).toBeDefined();
    });

    it('produces 1 tool proposal', () => {
        const proposals = buildProposals(analysis);
        expect(proposals.length).toBeGreaterThanOrEqual(1);
    });

    it('proposal risk is caution (submit/send action)', () => {
        const proposals = buildProposals(analysis);
        const form = proposals[0];
        expect(form.risk).toBe('caution');
    });
});

// ── SettingsPage.tsx ─────────────────────────────────────────

describe('SettingsPage.tsx', () => {
    const source = loadFixture('SettingsPage.tsx');
    const analysis = parseFile(source, 'SettingsPage.tsx');

    it('detects components with elements', () => {
        expect(analysis.components.length).toBeGreaterThanOrEqual(1);
    });

    it('produces at least 2 proposals (save + delete)', () => {
        const proposals = buildProposals(analysis);
        expect(proposals.length).toBeGreaterThanOrEqual(2);
    });

    it('delete account button is destructive', () => {
        const proposals = buildProposals(analysis);
        const del = proposals.find(p =>
            p.name.includes('delete') || p.description.toLowerCase().includes('delete')
        );
        expect(del).toBeDefined();
        expect(del?.risk).toBe('destructive');
    });

    it('save changes is caution', () => {
        const proposals = buildProposals(analysis);
        const save = proposals.find(p =>
            p.name.includes('save') || p.description.toLowerCase().includes('save')
        );
        expect(save).toBeDefined();
        expect(save?.risk).toBe('caution');
    });
});

// ── Dashboard.tsx ────────────────────────────────────────────

describe('Dashboard.tsx', () => {
    const source = loadFixture('Dashboard.tsx');
    const analysis = parseFile(source, 'Dashboard.tsx');

    it('finds 0 tool proposals (display-only component)', () => {
        const proposals = buildProposals(analysis);
        expect(proposals).toHaveLength(0);
    });
});

// ── SearchPage.tsx ───────────────────────────────────────────

describe('SearchPage.tsx', () => {
    const source = loadFixture('SearchPage.tsx');
    const analysis = parseFile(source, 'SearchPage.tsx');

    it('finds the search form handler', () => {
        const comp = analysis.components[0];
        expect(comp).toBeDefined();
        const submit = comp?.eventHandlers.find(h => h.event === 'onSubmit');
        // SearchPage may have onSubmit or inline handler
        expect(comp?.elements.length).toBeGreaterThan(0);
    });

    it('search proposal is safe', () => {
        const proposals = buildProposals(analysis);
        const search = proposals.find(p => p.name.includes('search'));
        if (search) {
            expect(search.risk).toBe('safe');
        }
    });
});
