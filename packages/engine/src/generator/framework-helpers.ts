// ────────────────────────────────────────────────────────────
// Framework DOM helpers — injected once at top of every .mcp.js
// These helpers work with React's synthetic event system by
// triggering native setter + bubbling input/change events.
// ────────────────────────────────────────────────────────────

export const FRAMEWORK_HELPERS = `
// ── WebMCP DOM helpers ──────────────────────────────────────
function __mcpFind(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  throw new Error('[WebMCP] Element not found matching any of: ' + selectors.join(', '));
}

function __mcpSetValue(selectors, value) {
  const el = __mcpFind(selectors);
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

function __mcpSetChecked(selectors, checked) {
  const el = __mcpFind(selectors);
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (nativeSetter) nativeSetter.call(el, checked);
  else el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __mcpSetSelect(selectors, value) {
  const el = __mcpFind(selectors);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __mcpClick(selectors) {
  const el = __mcpFind(selectors);
  el.click();
}
// ────────────────────────────────────────────────────────────
`;

// ── Selector builder ──────────────────────────────────────────

import type { UIElement } from '../types.js';

/**
 * Build a JSON array of fallback CSS selectors for a UI element.
 * Prioritizes the runtime-probed strategy fallback array if available.
 */
export function buildSelectorArray(el: UIElement): string {
  if (el.selectorFallback && el.selectorFallback.length > 0) {
    const strats = el.selectorFallback.map(s => s.value);
    return JSON.stringify(strats);
  }

  // AST fallback if probe was bypassed or failed
  const fallbacks: string[] = [];
  if (el.id) fallbacks.push(`#${el.id}`);
  if (el.attributes['data-testid']) fallbacks.push(`[data-testid="${el.attributes['data-testid']}"]`);
  if (el.name) fallbacks.push(`[name="${el.name}"]`);
  if (el.accessibilityHints?.ariaLabel) fallbacks.push(`[aria-label="${el.accessibilityHints.ariaLabel}"]`);
  if (el.inputType) fallbacks.push(`input[type="${el.inputType}"]`);

  if (fallbacks.length === 0) fallbacks.push(`/* TODO: add id to ${el.tag} */`);

  return JSON.stringify(fallbacks);
}

/**
 * Build the DOM interaction call for setting an element's value.
 * Returns the JS expression string (without semicolon).
 */
export function buildSetCall(el: UIElement, paramName: string): string {
  const sels = buildSelectorArray(el);
  if (el.tag === 'select') return `__mcpSetSelect(${sels}, ${paramName})`;
  if (el.inputType === 'checkbox') return `__mcpSetChecked(${sels}, ${paramName})`;
  return `__mcpSetValue(${sels}, ${paramName})`;
}

/**
 * Build the submit/trigger call for a form or button.
 */
export function buildSubmitCall(el: UIElement | undefined): string {
  if (!el) return `/* No trigger element found */`;

  if (el.tag === 'form') {
    // Find the submit button inside the form array
    const sels = buildSelectorArray(el);
    // We need to map the form selectors to find the submit button inside them
    const submitSels = JSON.parse(sels).map((s: string) => `${s} [type="submit"]`);
    return `__mcpClick(${JSON.stringify(submitSels)})`;
  }

  const sels = buildSelectorArray(el);
  return `__mcpClick(${sels})`;
}
