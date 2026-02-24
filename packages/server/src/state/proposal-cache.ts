import type { ToolProposal, ComponentAnalysis } from 'webmcp-instrument-engine';

// ── In-memory proposal cache with TTL ───────────────────────

interface CachedProposal {
    proposals: ToolProposal[];
    analysis: ComponentAnalysis;
    sourceCode: string;
    sourceHash: string;
    createdAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CachedProposal>();

export function cacheProposal(userId: string, fileHash: string, data: Omit<CachedProposal, 'createdAt'>): string {
    const key = `${userId}:${fileHash}`;

    // Cleanup stale entries
    for (const [k, v] of cache) {
        if (Date.now() - v.createdAt > TTL_MS) cache.delete(k);
    }

    cache.set(key, { ...data, createdAt: Date.now() });
    return key;
}

export function getProposal(userId: string, fileHash: string): CachedProposal | undefined {
    const key = `${userId}:${fileHash}`;
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > TTL_MS) {
        cache.delete(key);
        return undefined;
    }
    return entry;
}

/** Find the most recent proposal for a user (for multi-turn: selection after proposal) */
export function getLatestProposal(userId: string): CachedProposal | undefined {
    let latest: CachedProposal | undefined;
    for (const [key, entry] of cache) {
        if (!key.startsWith(userId)) continue;
        if (Date.now() - entry.createdAt > TTL_MS) { cache.delete(key); continue; }
        if (!latest || entry.createdAt > latest.createdAt) latest = entry;
    }
    return latest;
}

export function clearUserCache(userId: string): void {
    for (const key of cache.keys()) {
        if (key.startsWith(userId)) cache.delete(key);
    }
}
