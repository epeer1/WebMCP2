import { chromium, type Browser, type Page } from 'playwright';
import type { ProbeElement, ProbeResult } from '../types.js';

export interface ProbeOptions {
    headless?: boolean;
    timeoutMs?: number;
    /** If provided, evaluates this script before extraction (e.g. for harness setup) */
    setupScript?: string;
}

export async function runProbe(url: string, options: ProbeOptions = {}): Promise<ProbeResult> {
    const headless = options.headless ?? true;
    const timeout = options.timeoutMs ?? 10000;

    let browser: Browser | null = null;
    try {
        browser = await chromium.launch({ headless });
        const context = await browser.newContext();
        const page = await context.newPage();

        // 1. Navigate to target URL
        await page.goto(url, { waitUntil: 'load', timeout });

        // Wait a brief moment for dynamic frameworks (React/Vue) to render
        await page.waitForTimeout(500); // basic stabilization

        // 2. Run optional structural harness (e.g., clicking a 'Next' button or opening a Modal)
        if (options.setupScript) {
            await page.evaluate(options.setupScript);
            await page.waitForTimeout(500); // wait for state to settle
        }

        // 3. Extract Ground Truth accessibility tree
        const elements = await page.evaluate(extractDOMState);

        return {
            url,
            elements,
            timestamp: Date.now(),
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Executes entirely inside the Browser context.
 * Extract forms, inputs, buttons, and accessibility metadata.
 */
function extractDOMState(): ProbeElement[] {
    const results: ProbeElement[] = [];

    function generateStructuralSelector(el: HTMLElement): string {
        if (el.hasAttribute('data-mcp')) return `[data-mcp="${el.getAttribute('data-mcp')}"]`;
        if (el.hasAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
        if (el.id && !el.id.match(/\d{4,}/) && !el.id.includes('radix-')) return `#${el.id}`;

        const tag = el.tagName.toLowerCase();
        const name = el.getAttribute('name');
        if (name) return `${tag}[name="${name}"]`;
        return tag;
    }

    // Focus on interactive elements
    const candidates = document.querySelectorAll('input, button, select, textarea, form, [role="button"], [role="textbox"], [role="checkbox"]');

    candidates.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;

        const tag = el.tagName.toLowerCase();

        // Skip hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

        const rect = el.getBoundingClientRect();
        // Skip zero-dimension elements unless they are forms
        if (tag !== 'form' && (rect.width === 0 || rect.height === 0)) return;

        // Extract Attributes
        const attributes: Record<string, string> = {};
        for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            attributes[attr!.name] = attr!.value;
        }

        // Accessible Name calculation heuristics
        let accessibleName = '';
        if (el.hasAttribute('aria-label')) {
            accessibleName = el.getAttribute('aria-label')!;
        } else if (el.hasAttribute('aria-labelledby')) {
            const refId = el.getAttribute('aria-labelledby')!;
            const refEl = document.getElementById(refId);
            if (refEl) accessibleName = refEl.innerText || refEl.textContent || '';
        } else if (tag === 'button' || el.getAttribute('role') === 'button') {
            accessibleName = el.innerText || el.textContent || '';
        } else if (tag === 'input' && (el as HTMLInputElement).type === 'submit') {
            accessibleName = (el as HTMLInputElement).value;
        } else {
            // Find associated <label>
            if (el.id) {
                const labelEl = document.querySelector(`label[for="${el.id}"]`);
                if (labelEl) accessibleName = (labelEl as HTMLElement).innerText || labelEl.textContent || '';
            }
            // If no explicit label, try wrapping label: <label>Text <input/></label>
            if (!accessibleName) {
                const closestLabel = el.closest('label');
                if (closestLabel) {
                    // Get text node strictly belonging to label, excluding the input
                    accessibleName = (closestLabel as HTMLElement).innerText || closestLabel.textContent || '';
                }
            }
            if (!accessibleName && el.hasAttribute('placeholder')) {
                accessibleName = el.getAttribute('placeholder')!;
            }
        }

        accessibleName = accessibleName.trim();

        // Determine Role
        let role = el.getAttribute('role');
        if (!role) {
            if (tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset'].includes((el as HTMLInputElement).type))) role = 'button';
            else if (tag === 'input' && ['text', 'email', 'password', 'search', 'url'].includes((el as HTMLInputElement).type)) role = 'textbox';
            else if (tag === 'input' && (el as HTMLInputElement).type === 'checkbox') role = 'checkbox';
            else if (tag === 'input' && (el as HTMLInputElement).type === 'radio') role = 'radio';
            else if (tag === 'select') role = 'combobox';
            else if (tag === 'textarea') role = 'textbox';
            else if (tag === 'form') role = 'form';
        }

        results.push({
            tag,
            id: el.id || undefined,
            nameAttribute: el.getAttribute('name') || undefined,
            inputType: tag === 'input' ? (el as HTMLInputElement).type : undefined,
            accessibleName,
            role: role || tag,
            selector: generateStructuralSelector(el),
            bounds: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
            },
            attributes,
            isInteractive: tag !== 'form'
        });
    });

    return results;
}
