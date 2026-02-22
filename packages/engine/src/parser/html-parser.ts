import { Parser } from 'htmlparser2';
import { basename, extname } from 'node:path';
import type {
    ComponentAnalysis,
    ComponentInfo,
    UIElement,
    EventHandler,
    ComponentType,
} from '../types.js';

const INTERACTIVE_TAGS = new Set(['input', 'button', 'select', 'textarea']);

// ── Public entry point ────────────────────────────────────────

export function parseHTMLFile(source: string, fileName: string): ComponentAnalysis {
    const componentName = basename(fileName, extname(fileName));

    const { elements, formGroups } = walkHTML(source);

    // Build component info
    const type = classifyType(elements, formGroups);
    const handlers = extractInlineHandlers(source);

    const component: ComponentInfo = {
        name: componentName,
        type,
        elements,
        eventHandlers: handlers,
        stateVariables: [],
        props: [],
    };

    return {
        fileName,
        framework: 'html',
        components: elements.length > 0 ? [component] : [],
    };
}

// ── HTML walker ───────────────────────────────────────────────

interface WalkResult {
    elements: UIElement[];
    formGroups: Map<string | undefined, UIElement[]>;
}

function walkHTML(source: string): WalkResult {
    const elements: UIElement[] = [];
    const formGroups = new Map<string | undefined, UIElement[]>();

    let formDepth = 0;
    let currentFormId: string | undefined;
    // Tracks text content of button being parsed
    let insideButton = false;
    let buttonText = '';
    let pendingButtonEl: UIElement | null = null;

    const parser = new Parser({
        onopentag(name, attrs) {
            if (name === 'form') {
                formDepth++;
                currentFormId = attrs['id'];
                formGroups.set(currentFormId, []);
                // Add form element itself
                elements.push({
                    tag: 'form',
                    id: attrs['id'],
                    name: attrs['name'],
                    attributes: attrs,
                    parentFormId: undefined,
                });
                return;
            }

            if (name === 'button') {
                insideButton = true;
                buttonText = '';
                pendingButtonEl = {
                    tag: 'button',
                    id: attrs['id'],
                    name: attrs['name'],
                    inputType: attrs['type'],
                    label: undefined, // filled by ontext
                    attributes: attrs,
                    parentFormId: formDepth > 0 ? currentFormId : undefined,
                };
                return;
            }

            if (INTERACTIVE_TAGS.has(name)) {
                const el: UIElement = {
                    tag: name,
                    id: attrs['id'],
                    name: attrs['name'],
                    inputType: attrs['type'],
                    label: attrs['placeholder'] ?? attrs['aria-label'],
                    attributes: attrs,
                    parentFormId: formDepth > 0 ? currentFormId : undefined,
                };

                // Validation hints
                const validation: string[] = [];
                if (attrs['required'] !== undefined) validation.push('required');
                if (attrs['minlength']) validation.push(`minLength:${attrs['minlength']}`);
                if (attrs['pattern']) validation.push(`pattern:${attrs['pattern']}`);
                if (validation.length) el.validation = validation;

                // Accessibility
                if (attrs['aria-label'] || attrs['aria-describedby'] || attrs['role']) {
                    el.accessibilityHints = {
                        ariaLabel: attrs['aria-label'],
                        ariaDescribedBy: attrs['aria-describedby'],
                        role: attrs['role'],
                    };
                }

                elements.push(el);
                if (formDepth > 0 && currentFormId !== undefined) {
                    formGroups.get(currentFormId)?.push(el);
                }
            }
        },

        ontext(text) {
            if (insideButton) buttonText += text;
        },

        onclosetag(name) {
            if (name === 'form') {
                formDepth--;
                if (formDepth === 0) currentFormId = undefined;
            }

            if (name === 'button' && pendingButtonEl) {
                const label = (buttonText.trim() || pendingButtonEl.attributes['value']) ?? undefined;
                pendingButtonEl.label = label;
                elements.push(pendingButtonEl);
                if (formDepth > 0 && currentFormId !== undefined) {
                    formGroups.get(currentFormId)?.push(pendingButtonEl);
                }
                insideButton = false;
                buttonText = '';
                pendingButtonEl = null;
            }
        },
    });

    parser.write(source);
    parser.end();

    return { elements, formGroups };
}

// ── Inline handler extraction ─────────────────────────────────

const INLINE_HANDLER_RE = /on(submit|click|change)=['"]([^'"]+)['"]/gi;

function extractInlineHandlers(source: string): EventHandler[] {
    const handlers: EventHandler[] = [];
    let m: RegExpExecArray | null;

    while ((m = INLINE_HANDLER_RE.exec(source)) !== null) {
        const event = `on${m[1].charAt(0).toUpperCase()}${m[1].slice(1)}` as string;
        const body = m[2];
        handlers.push({
            name: `inline_${m[1]}_handler`,
            event,
            body,
            isAsync: false,
        });
    }

    return handlers;
}

// ── Classification ────────────────────────────────────────────

function classifyType(elements: UIElement[], formGroups: Map<string | undefined, UIElement[]>): ComponentType {
    const hasForms = formGroups.size > 0;
    const hasInputs = elements.some(el => ['input', 'textarea', 'select'].includes(el.tag));
    const hasButtons = elements.some(el => el.tag === 'button');

    if (hasForms && hasInputs) return 'form';
    if (hasButtons && !hasInputs) return 'action';
    if (hasInputs || hasButtons) return 'mixed';
    return 'display';
}
