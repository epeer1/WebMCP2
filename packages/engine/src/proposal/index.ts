import { createHash } from 'node:crypto';
import type {
    ComponentAnalysis,
    ComponentInfo,
    UIElement,
    EventHandler,
    ToolProposal,
    ToolInputSchema,
    ToolInputProperty,
} from '../types.js';
import { classifyRisk } from '../classifier/risk-classifier.js';

// ── Tool candidate (internal grouping before final proposal) ──

interface ToolCandidate {
    type: 'form' | 'action';
    componentName: string;
    /** The button/form that triggers the action */
    triggerElement?: UIElement;
    /** Input fields the agent will fill */
    inputElements: UIElement[];
    /** The handler function */
    handler?: EventHandler;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Given a full ComponentAnalysis, produce ToolProposal[] ready for user review.
 * Each proposal has a name, description, risk level, and JSON schema.
 */
export function buildProposals(analysis: ComponentAnalysis): ToolProposal[] {
    const proposals: ToolProposal[] = [];
    let index = 1;

    for (const component of analysis.components) {
        const candidates = groupIntoToolCandidates(component);

        for (const candidate of candidates) {
            const { risk, reason } = classifyRisk(candidate.triggerElement, candidate.handler);

            // Excluded tools are omitted from the proposal list entirely
            if (risk === 'excluded') continue;

            const name = generateToolName(candidate);
            const description = generateDescription(candidate);
            const inputSchema = buildSchema(candidate);
            const id = generateToolId(candidate);

            const { isStable, unstableReason } = assessStability(candidate);

            proposals.push({
                index: index++,
                id,
                name,
                description,
                risk,
                riskReason: reason,
                isStable,
                unstableReason,
                selected: risk !== 'destructive' && isStable !== false,  // require stability to pre-check
                inputSchema,
                sourceMapping: {
                    componentName: candidate.componentName,
                    triggerElement: candidate.triggerElement,
                    inputElements: candidate.inputElements,
                    handler: candidate.handler,
                },
            });
        }
    }

    return proposals;
}

// ── Grouping logic ────────────────────────────────────────────

function groupIntoToolCandidates(component: ComponentInfo): ToolCandidate[] {
    const candidates: ToolCandidate[] = [];
    const usedButtons = new Set<UIElement>();

    // ── Group 1: Form-based tools ─────────────────────────────
    // Path A: React — driven by onSubmit event handlers
    const submitHandlers = component.eventHandlers.filter(h => h.event === 'onSubmit');

    if (submitHandlers.length > 0) {
        for (const handler of submitHandlers) {
            const inputs = component.elements.filter(el =>
                ['input', 'textarea', 'select'].includes(el.tag) &&
                !isPasswordOnly(el) &&
                el.inputType !== 'file'
            );

            const submitBtn = component.elements.find(
                el => el.tag === 'button' && (el.inputType === 'submit' || el.attributes['type'] === 'submit')
            ) ?? component.elements.find(el => el.tag === 'button');

            if (submitBtn) usedButtons.add(submitBtn);

            candidates.push({
                type: 'form',
                componentName: component.name,
                triggerElement: submitBtn,
                inputElements: inputs,
                handler,
            });
        }
    } else {
        // Path B: HTML — driven by <form> elements (no JS onSubmit handlers needed)
        const formElements = component.elements.filter(el => el.tag === 'form');

        for (const formEl of formElements) {
            const formId = formEl.id;

            // Inputs inside this form
            const inputs = component.elements.filter(el =>
                ['input', 'textarea', 'select'].includes(el.tag) &&
                !isPasswordOnly(el) &&
                el.inputType !== 'file' &&
                (formId === undefined || el.parentFormId === formId || el.parentFormId === undefined)
            );

            // Submit button inside this form (or first button)
            const submitBtn = component.elements.find(
                el => el.tag === 'button' &&
                    (el.inputType === 'submit' || el.attributes['type'] === 'submit') &&
                    (formId === undefined || el.parentFormId === formId)
            ) ?? component.elements.find(el => el.tag === 'button');

            if (submitBtn) usedButtons.add(submitBtn);

            // Inline onSubmit handler if present
            const handler = component.eventHandlers.find(h => h.event === 'onSubmit');

            if (inputs.length > 0 || submitBtn) {
                candidates.push({
                    type: 'form',
                    componentName: component.name,
                    triggerElement: submitBtn,
                    inputElements: inputs,
                    handler,
                });
            }
        }

        // If there are inputs but no explicit <form> element (rare), treat them as one group
        if (formElements.length === 0) {
            const inputs = component.elements.filter(el =>
                ['input', 'textarea', 'select'].includes(el.tag) &&
                !isPasswordOnly(el) &&
                el.inputType !== 'file'
            );
            const submitBtn = component.elements.find(
                el => el.tag === 'button' && (el.inputType === 'submit' || el.attributes['type'] === 'submit')
            ) ?? component.elements.find(el => el.tag === 'button');

            if (inputs.length > 0 && submitBtn) {
                if (submitBtn) usedButtons.add(submitBtn);
                candidates.push({
                    type: 'form',
                    componentName: component.name,
                    triggerElement: submitBtn,
                    inputElements: inputs,
                    handler: undefined,
                });
            }
        }
    }

    // ── Group 2: Standalone buttons (not used above) ──────────
    const standaloneButtons = component.elements.filter(el =>
        el.tag === 'button' &&
        el.inputType !== 'submit' &&
        el.attributes['type'] !== 'submit' &&
        !usedButtons.has(el)
    );

    for (const btn of standaloneButtons) {
        const handler = findHandlerForButton(btn, component.eventHandlers);

        candidates.push({
            type: 'action',
            componentName: component.name,
            triggerElement: btn,
            inputElements: [],
            handler,
        });
    }

    return candidates;
}

function isPasswordOnly(el: UIElement): boolean {
    return el.inputType === 'password';
}

function findHandlerForButton(btn: UIElement, handlers: EventHandler[]): EventHandler | undefined {
    // Match by elementId if we have it
    if (btn.id) {
        const byId = handlers.find(h => h.elementId === btn.id && h.event === 'onClick');
        if (byId) return byId;
    }
    // Match by elementTag
    return handlers.find(h => h.event === 'onClick' && h.elementTag === 'button');
}

// ── Name + Description generation ────────────────────────────

function generateToolName(candidate: ToolCandidate): string {
    const componentSlug = toSnakeCase(candidate.componentName);

    if (candidate.type === 'form') {
        // Use submit button label or handler name
        const label = candidate.triggerElement?.label ?? candidate.handler?.name;
        if (label) return `${toSnakeCase(label)}_${componentSlug}`;
        return `submit_${componentSlug}`;
    }

    // Standalone action: use button label
    const label = candidate.triggerElement?.label ??
        candidate.triggerElement?.id ??
        candidate.handler?.name;
    if (label) return toSnakeCase(label);
    return `action_in_${componentSlug}`;
}

function generateDescription(candidate: ToolCandidate): string {
    if (candidate.type === 'form') {
        const btnLabel = candidate.triggerElement?.label;
        const fields = candidate.inputElements
            .map(el => el.label ?? el.name ?? el.id ?? el.tag)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ');

        if (btnLabel && fields) return `${btnLabel} the form with: ${fields}`;
        if (btnLabel) return `${btnLabel} the ${candidate.componentName} form`;
        return `Fill and submit the ${candidate.componentName} form`;
    }

    // Standalone action
    const label = candidate.triggerElement?.label;
    if (label) return `Trigger: ${label}`;
    return `Perform action in ${candidate.componentName}`;
}

// ── JSON Schema generation ────────────────────────────────────

function buildSchema(candidate: ToolCandidate): ToolInputSchema {
    const properties: Record<string, ToolInputProperty> = {};
    const required: string[] = [];

    for (const el of candidate.inputElements) {
        const fieldName = el.name ?? el.id ?? el.stateBinding?.variable ?? el.label;
        if (!fieldName) continue;

        const safeKey = toSnakeCase(fieldName);
        const type = mapInputTypeToJSONType(el.inputType ?? 'text');
        const description = el.label ?? el.accessibilityHints?.ariaLabel ?? `${el.inputType ?? el.tag} field`;

        const prop: ToolInputProperty = { type, description };

        // Enum options from <select> (would need to walk option children — simplified for now)
        if (el.tag === 'select') {
            prop.description = `${description} (select field)`;
        }

        properties[safeKey] = prop;
        if (el.validation?.includes('required')) required.push(safeKey);
    }

    return { type: 'object', properties, required };
}

function mapInputTypeToJSONType(inputType: string): string {
    switch (inputType) {
        case 'number':
        case 'range':
            return 'number';
        case 'checkbox':
            return 'boolean';
        case 'date':
        case 'datetime-local':
        case 'time':
            return 'string';
        default:
            return 'string';
    }
}

// ── Confidence Stability Assessment ───────────────────────────

/**
 * Enforces the "Confidence Threshold Policy":
 * If any input field has a max selector fallback score < 0.6, the tool is marked unstable.
 */
function assessStability(candidate: ToolCandidate): { isStable: boolean; unstableReason?: string } {
    const threshold = 0.6;

    // Check all parsed inputs for stability
    for (const el of candidate.inputElements) {
        if (!el.selectorFallback || el.selectorFallback.length === 0) {
            return {
                isStable: false,
                unstableReason: `Input field '${el.name ?? el.id ?? el.tag}' lacks a runtime selector`,
            };
        }

        const topScore = Math.max(...el.selectorFallback.map(s => s.score));
        if (topScore < threshold) {
            return {
                isStable: false,
                unstableReason: `Unstable selector for '${el.name ?? el.label ?? el.tag}' (max confidence: ${topScore.toFixed(1)} < ${threshold})`,
            };
        }
    }

    // Check trigger element (if present) for stability
    if (candidate.triggerElement) {
        const trg = candidate.triggerElement;
        if (!trg.selectorFallback || trg.selectorFallback.length === 0) {
            return {
                isStable: false,
                unstableReason: `Trigger button lacks a runtime selector`,
            };
        }
        const topScore = Math.max(...trg.selectorFallback.map(s => s.score));
        if (topScore < threshold) {
            return {
                isStable: false,
                unstableReason: `Unstable trigger selector (max confidence: ${topScore.toFixed(1)} < ${threshold})`,
            };
        }
    }

    return { isStable: true };
}

// ── Utilities ─────────────────────────────────────────────────

function toSnakeCase(str: string): string {
    return str
        .replace(/([A-Z])/g, '_$1')
        .replace(/[\s\-]+/g, '_')
        .replace(/[^a-z0-9_]/gi, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
}

/** 
 * Generates a stable deterministic ID by hashing the *semantic intent* of the tool candidate.
 * Explicitly ignores styling, DOM layout changes, and code positions.
 */
function generateToolId(candidate: ToolCandidate): string {
    const parts: string[] = [];

    // Form grouping boundary
    parts.push(candidate.componentName);
    parts.push(candidate.type);

    // Trigger action semantics
    if (candidate.triggerElement) {
        parts.push(candidate.triggerElement.tag);
        parts.push(candidate.triggerElement.label ?? '');
        parts.push(candidate.triggerElement.attributes['name'] ?? '');
    }

    // Input field semantics
    for (const el of candidate.inputElements) {
        // Field identifier
        parts.push(el.name ?? el.id ?? el.stateBinding?.variable ?? '');
        // Field accessibility label
        parts.push(el.label ?? el.accessibilityHints?.ariaLabel ?? '');
        // Field role
        parts.push(el.inputType ?? el.tag);
    }

    const raw = parts.join('|').toLowerCase();
    return createHash('sha256').update(raw).digest('hex').slice(0, 12);
}
