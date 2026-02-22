import type { WebMCPConfig } from '../types.js';

// ── Default config ────────────────────────────────────────────

export function getDefaultConfig(): WebMCPConfig {
    return {
        classification: {
            destructive: 'include-with-warning',
            navigation: 'exclude',
        },
        output: {
            format: 'iife',
            fileExtension: '.mcp.js',
        },
        llm: {
            backend: undefined,
            model: undefined,
            temperature: 0.1,
        },
        specVersion: '0.1',
    };
}

// ── Config loader (cosmiconfig) ───────────────────────────────

let cosmiconfig: typeof import('cosmiconfig') | undefined;

/**
 * Load the nearest WebMCP config file using cosmiconfig.
 * Falls back to defaults if no config file is found.
 *
 * Supported locations (in priority order):
 *   .webmcprc.json, .webmcprc.yml, .webmcprc.yaml,
 *   webmcp.config.js, webmcp.config.ts,
 *   package.json (under "webmcp" key)
 */
export async function loadConfig(searchFrom?: string): Promise<WebMCPConfig> {
    try {
        // Dynamic import avoids bundling issues and keeps tree-shaking happy
        if (!cosmiconfig) {
            cosmiconfig = await import('cosmiconfig');
        }

        const explorer = cosmiconfig.cosmiconfig('webmcp', {
            searchPlaces: [
                '.webmcprc.json',
                '.webmcprc.yml',
                '.webmcprc.yaml',
                'webmcp.config.js',
                'webmcp.config.ts',
                'package.json',
            ],
        });

        const result = await explorer.search(searchFrom);
        if (!result || result.isEmpty) return getDefaultConfig();

        return mergeWithDefaults(result.config as Partial<WebMCPConfig>);
    } catch {
        // cosmiconfig not available or search failed — fall back to defaults
        return getDefaultConfig();
    }
}

/** Synchronous version — used in non-async contexts */
export function loadConfigSync(searchFrom?: string): WebMCPConfig {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { cosmiconfigSync } = require('cosmiconfig') as typeof import('cosmiconfig');
        const explorer = cosmiconfigSync('webmcp', {
            searchPlaces: [
                '.webmcprc.json',
                '.webmcprc.yml',
                '.webmcprc.yaml',
                'webmcp.config.js',
                'package.json',
            ],
        });

        const result = explorer.search(searchFrom ?? process.cwd());
        if (!result || result.isEmpty) return getDefaultConfig();

        return mergeWithDefaults(result.config as Partial<WebMCPConfig>);
    } catch {
        return getDefaultConfig();
    }
}

// ── Merge helpers ─────────────────────────────────────────────

function mergeWithDefaults(partial: Partial<WebMCPConfig>): WebMCPConfig {
    const defaults = getDefaultConfig();
    return {
        ...defaults,
        ...partial,
        classification: { ...defaults.classification, ...partial.classification },
        output: { ...defaults.output, ...partial.output },
        llm: { ...defaults.llm, ...partial.llm },
    };
}
