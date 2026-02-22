import { describe, it, expect } from 'vitest';
import { classifyRisk } from '../src/classifier/risk-classifier.js';
import type { UIElement, EventHandler } from '../src/types.js';

function makeElement(overrides: Partial<UIElement> = {}): UIElement {
  return {
    tag: 'button',
    attributes: {},
    ...overrides,
  };
}

function makeHandler(overrides: Partial<EventHandler> = {}): EventHandler {
  return {
    name: 'handler',
    event: 'onClick',
    isAsync: false,
    ...overrides,
  };
}

describe('classifyRisk', () => {
  it('classifies delete action as destructive', () => {
    const result = classifyRisk(
      makeElement({ label: 'Delete Account' }),
      makeHandler({ name: 'handleDelete' }),
    );
    expect(result.risk).toBe('destructive');
  });

  it('classifies DELETE HTTP method as destructive', () => {
    const result = classifyRisk(
      makeElement(),
      makeHandler({ apiCalls: [{ method: 'DELETE', url: '/api/user' }] }),
    );
    expect(result.risk).toBe('destructive');
  });

  it('classifies submit/save as caution', () => {
    const result = classifyRisk(
      makeElement({ label: 'Save Changes' }),
      makeHandler({ name: 'handleSubmit' }),
    );
    expect(result.risk).toBe('caution');
  });

  it('classifies POST method as caution', () => {
    const result = classifyRisk(
      makeElement(),
      makeHandler({ apiCalls: [{ method: 'POST', url: '/api/contact' }] }),
    );
    expect(result.risk).toBe('caution');
  });

  it('classifies navigation as excluded', () => {
    const result = classifyRisk(
      makeElement({ label: 'Navigate to Home' }),
      makeHandler({ name: 'handleNavigate' }),
    );
    expect(result.risk).toBe('excluded');
  });

  it('classifies search as safe', () => {
    const result = classifyRisk(
      makeElement({ label: 'Search' }),
      makeHandler({ name: 'handleSearch' }),
    );
    expect(result.risk).toBe('safe');
  });

  it('classifies unknown actions as safe', () => {
    const result = classifyRisk(
      makeElement({ label: 'Show Details' }),
      makeHandler({ name: 'handleShowDetails' }),
    );
    expect(result.risk).toBe('safe');
  });

  it('handles missing handler gracefully', () => {
    const result = classifyRisk(makeElement({ label: 'Click me' }));
    expect(result.risk).toBe('safe');
  });

  it('handles missing element gracefully', () => {
    const result = classifyRisk(undefined, makeHandler({ name: 'handleReset' }));
    expect(result.risk).toBe('destructive');
  });
});
