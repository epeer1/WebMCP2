// ────────────────────────────────────────────────────────────
// Framework DOM helpers — injected once at top of every .mcp.js
// These helpers work with React's synthetic event system by
// triggering native setter + bubbling input/change events.
// ────────────────────────────────────────────────────────────

export const FRAMEWORK_HELPERS = `
// ── WebMCP DOM helpers ──────────────────────────────────────
function __mcpSetValue(selector, value) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('[WebMCP] Element not found: ' + selector);
  // Use native setter to bypass React's value tracking
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __mcpSetChecked(selector, checked) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('[WebMCP] Element not found: ' + selector);
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (nativeSetter) nativeSetter.call(el, checked);
  else el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __mcpSetSelect(selector, value) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('[WebMCP] Element not found: ' + selector);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __mcpClick(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('[WebMCP] Element not found: ' + selector);
  el.click();
}
// ────────────────────────────────────────────────────────────
`;

// ── Selector builder ──────────────────────────────────────────

import type { UIElement } from '../types.js';

/**
 * Build the most stable CSS selector for a UI element.
 * Priority: id > data-testid > name > aria-label > positional comment
 */
export function buildSelector(el: UIElement): string {
    if (el.id) return `#${el.id}`;
    if (el.attributes['data-testid']) return `[data-testid="${el.attributes['data-testid']}"]`;
    if (el.name) return `[name="${el.name}"]`;
    if (el.accessibilityHints?.ariaLabel) return `[aria-label="${el.accessibilityHints.ariaLabel}"]`;
    if (el.inputType) return `input[type="${el.inputType}"]`;
    // Last resort: positional — tell dev to add an id
    return `/* TODO: add id or data-testid to this ${el.tag} element */`;
}

/**
 * Build the DOM interaction call for setting an element's value.
 * Returns the JS expression string (without semicolon).
 */
export function buildSetCall(el: UIElement, paramName: string): string {
    const sel = buildSelector(el);
    if (el.tag === 'select') return `__mcpSetSelect('${sel}', ${paramName})`;
    if (el.inputType === 'checkbox') return `__mcpSetChecked('${sel}', ${paramName})`;
    return `__mcpSetValue('${sel}', ${paramName})`;
}

/**
 * Build the submit/trigger call for a form or button.
 */
export function buildSubmitCall(el: UIElement | undefined): string {
    if (!el) return `/* No trigger element found */`;
    const sel = buildSelector(el);
    if (el.tag === 'form') return `__mcpClick('${sel} [type="submit"]')`;
    return `__mcpClick('${sel}')`;
}
