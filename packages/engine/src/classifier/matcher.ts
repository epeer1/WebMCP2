import type { UIElement, ProbeElement, SelectorStrategy } from '../types.js';

/**
 * Mutates astElements by attaching synthesized .selectorFallback arrays
 * based on scoring against the runtime probe Ground Truth.
 */
export function matchElementsToProbe(astElements: UIElement[], probeElements: ProbeElement[]): void {
    for (const astEl of astElements) {
        let bestMatch: ProbeElement | null = null;
        let bestScore = 0;

        for (const probeEl of probeElements) {
            const score = calculateMatchScore(astEl, probeEl);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = probeEl;
            }
        }

        if (bestMatch && bestScore > 0.3) {
            astEl.selectorFallback = synthesizeStrategies(bestMatch, bestScore);
        } else {
            // No strong runtime match found. Fallback to basic AST-derived CSS if possible.
            astEl.selectorFallback = fallbackToASTStrategies(astEl);
        }
    }
}

function calculateMatchScore(astEl: UIElement, probeEl: ProbeElement): number {
    let score = 0;

    // 1. Name/ID exact match (Strongest signal)
    if (astEl.id && astEl.id === probeEl.id) score += 0.5;
    if (astEl.name && astEl.name === probeEl.nameAttribute) score += 0.4;

    // 2. Data attribute hooks (Very strong)
    if (astEl.attributes['data-testid'] && astEl.attributes['data-testid'] === probeEl.attributes['data-testid']) score += 0.6;
    if (astEl.attributes['data-mcp'] && astEl.attributes['data-mcp'] === probeEl.attributes['data-mcp']) score += 0.8;

    // 3. Label text similarity
    const astLabel = (astEl.label ?? astEl.accessibilityHints?.ariaLabel ?? '').toLowerCase();
    const probeLabel = probeEl.accessibleName.toLowerCase();

    if (astLabel && probeLabel) {
        if (astLabel === probeLabel) {
            score += 0.4;
        } else if (probeLabel.includes(astLabel) || astLabel.includes(probeLabel)) {
            score += 0.2;
        }
        // Could implement Levenshtein here for fuzzy matching, but substring is a good start.
    }

    // 4. Role matching
    const expectedRole = mapTagToRole(astEl.tag, astEl.inputType);
    if (expectedRole === probeEl.role) {
        score += 0.2;
    }

    return Math.min(score, 1.0); // cap at 1.0
}

function synthesizeStrategies(probeEl: ProbeElement, matchScore: number): SelectorStrategy[] {
    const strategies: SelectorStrategy[] = [];

    if (probeEl.attributes['data-mcp']) {
        strategies.push({ strategy: 'mcp', value: probeEl.attributes['data-mcp'], score: 1.0 });
    }

    if (probeEl.attributes['data-testid']) {
        strategies.push({ strategy: 'testid', value: probeEl.attributes['data-testid'], score: 0.9 });
    }

    if (probeEl.accessibleName) {
        strategies.push({ strategy: 'label', value: probeEl.accessibleName, score: 0.8 });
    }

    if (probeEl.role && probeEl.accessibleName) {
        strategies.push({ strategy: 'role', value: `${probeEl.role}:${probeEl.accessibleName}`, score: 0.6 });
    }

    // Always provide the structural CSS selector as the absolute fallback, scaled by the match confidence
    strategies.push({ strategy: 'css', value: probeEl.selector, score: Math.max(0.2, matchScore * 0.5) });

    // Sort by confidence descending
    return strategies.sort((a, b) => b.score - a.score);
}

function fallbackToASTStrategies(astEl: UIElement): SelectorStrategy[] {
    const strategies: SelectorStrategy[] = [];

    if (astEl.id) {
        strategies.push({ strategy: 'css', value: `#${astEl.id}`, score: 0.5 });
    }
    if (astEl.name) {
        strategies.push({ strategy: 'css', value: `${astEl.tag}[name="${astEl.name}"]`, score: 0.4 });
    }
    if (astEl.attributes['data-testid']) {
        strategies.push({ strategy: 'testid', value: astEl.attributes['data-testid'], score: 0.9 });
    }

    strategies.push({ strategy: 'css', value: astEl.tag, score: 0.1 });
    return strategies.sort((a, b) => b.score - a.score);
}

function mapTagToRole(tag: string, inputType?: string): string {
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
        if (['submit', 'button', 'reset'].includes(inputType || '')) return 'button';
        if (['text', 'email', 'password', 'search', 'url'].includes(inputType || 'text')) return 'textbox';
        if (inputType === 'checkbox') return 'checkbox';
        if (inputType === 'radio') return 'radio';
    }
    return tag; // fallback
}
