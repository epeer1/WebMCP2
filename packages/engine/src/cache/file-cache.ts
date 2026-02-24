import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { hashInteractiveSurface } from './hash.js';
import type { ToolProposal } from '../types.js';

const CACHE_DIR = resolve(process.cwd(), '.webmcp');
const CACHE_FILE = resolve(CACHE_DIR, 'cache.json');

interface CacheEntry {
    handlerBody: string;
    timestamp: number;
}

type GlobalCache = Record<string, CacheEntry>;

let inMemoryCache: GlobalCache | null = null;

function loadCache(): GlobalCache {
    if (inMemoryCache) return inMemoryCache;
    if (!existsSync(CACHE_FILE)) {
        inMemoryCache = {};
        return inMemoryCache;
    }
    try {
        const data = readFileSync(CACHE_FILE, 'utf-8');
        inMemoryCache = JSON.parse(data);
    } catch {
        inMemoryCache = {};
    }
    return inMemoryCache!;
}

function saveCache(cache: GlobalCache): void {
    if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Returns the cached handler body for a tool if its interactive surface hash matches,
 * otherwise returns null.
 */
export function getCachedHandler(tool: ToolProposal): string | null {
    const cache = loadCache();
    const hash = hashInteractiveSurface(tool);
    const entry = cache[hash];
    if (entry) {
        return entry.handlerBody;
    }
    return null;
}

/**
 * Saves the generated handler body for a tool against its interactive surface hash.
 */
export function setCachedHandler(tool: ToolProposal, handlerBody: string): void {
    const cache = loadCache();
    const hash = hashInteractiveSurface(tool);
    cache[hash] = {
        handlerBody,
        timestamp: Date.now()
    };
    inMemoryCache = cache;
    saveCache(cache);
}
