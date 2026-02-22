import {
  type ToolRisk,
  type EventHandler,
  type UIElement,
  DESTRUCTIVE_KEYWORDS,
  CAUTION_KEYWORDS,
  EXCLUDED_PATTERNS,
} from '../types.js';

export interface RiskClassification {
  risk: ToolRisk;
  reason: string;
}

/**
 * Classify risk level of a tool based on its trigger element,
 * handler name, handler body, and API calls.
 */
export function classifyRisk(
  triggerElement?: UIElement,
  handler?: EventHandler,
): RiskClassification {
  const signals: string[] = [];

  // Collect all text signals to scan
  if (triggerElement?.label) signals.push(triggerElement.label.toLowerCase());
  if (triggerElement?.name) signals.push(triggerElement.name.toLowerCase());
  if (triggerElement?.id) signals.push(triggerElement.id.toLowerCase());
  if (handler?.name) signals.push(handler.name.toLowerCase());
  if (handler?.body) signals.push(handler.body.toLowerCase());

  // Check HTTP methods in handler
  const httpMethods = handler?.apiCalls?.map(c => c.method.toUpperCase()) ?? [];

  const allText = signals.join(' ');

  // 1. Check excluded patterns first
  for (const pattern of EXCLUDED_PATTERNS) {
    if (allText.includes(pattern)) {
      return { risk: 'excluded', reason: `Matches excluded pattern: "${pattern}"` };
    }
  }

  // 2. Check destructive
  for (const keyword of DESTRUCTIVE_KEYWORDS) {
    if (allText.includes(keyword)) {
      return { risk: 'destructive', reason: `Contains destructive keyword: "${keyword}"` };
    }
  }
  if (httpMethods.includes('DELETE')) {
    return { risk: 'destructive', reason: 'Handler makes DELETE API call' };
  }

  // 3. Check caution (mutation)
  for (const keyword of CAUTION_KEYWORDS) {
    if (allText.includes(keyword)) {
      return { risk: 'caution', reason: `Contains mutation keyword: "${keyword}"` };
    }
  }
  if (httpMethods.some(m => ['POST', 'PUT', 'PATCH'].includes(m))) {
    return { risk: 'caution', reason: `Handler makes ${httpMethods.join(', ')} API call` };
  }

  // 4. Default: safe (read-only actions, search, display toggles)
  return { risk: 'safe', reason: 'No mutation or destructive signals detected' };
}
