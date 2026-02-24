import type { Plugin } from 'vite';
import { resolve } from 'path';
import { parseFile } from '@webmcp/engine/parser';
import { buildProposals } from '@webmcp/engine/proposal';
import { generateMCPCodeSync } from '@webmcp/engine/generator';
import { readFileSync, existsSync } from 'fs';
import fg from 'fast-glob';
const { globSync } = fg;

export interface WebMCPPluginOptions {
    include?: string[];
    llm?: string; // e.g. 'openai'
}

const VIRTUAL_MODULE_ID = 'virtual:webmcp-tools';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

export default function webmcpPlugin(options: WebMCPPluginOptions = {}): Plugin {
    const includeGlobs = options.include || ['src/**/*.tsx', 'src/**/*.jsx', 'src/**/*.vue'];
    let generatedCodes: Map<string, string> = new Map();

    function scanAndGenerateAll() {
        generatedCodes.clear();
        const cwd = process.cwd();
        const files = includeGlobs.flatMap(g => globSync(g, { absolute: true, cwd }));
        for (const file of files) {
            if (existsSync(file)) {
                generateForFile(file);
            }
        }
    }

    function generateForFile(file: string) {
        try {
            const source = readFileSync(file, 'utf-8');
            const analysis = parseFile(source, file);
            const proposals = buildProposals(analysis);

            // Filter out excluded tools
            const validProposals = proposals.filter(p => p.risk !== 'excluded');

            if (validProposals.length === 0) {
                generatedCodes.delete(file);
                return;
            }

            // Generate Code implementation
            // Use generateMCPCodeSync to prevent blocking Vite compilation flow, 
            // rely on cache populating over time for LLM parts or fallback
            const code = generateMCPCodeSync(validProposals, {
                format: 'esm',
                framework: analysis.framework
            });
            generatedCodes.set(file, code);
            console.log(`[WebMCP] Incremental update (LLM bypassed) for ${file}`);
        } catch (err) {
            // Ignored non-parseable files
        }
    }

    return {
        name: 'vite-plugin-webmcp',
        enforce: 'pre',

        buildStart() {
            scanAndGenerateAll();
        },

        resolveId(id) {
            if (id === VIRTUAL_MODULE_ID) {
                return RESOLVED_VIRTUAL_MODULE_ID;
            }
        },

        load(id) {
            if (id === RESOLVED_VIRTUAL_MODULE_ID) {
                const codes = Array.from(generatedCodes.values()).join('\n\n');
                return `
          // Virtual module injecting WebMCP tools
          ${codes}
        `;
            }
        },

        handleHotUpdate({ file, server, modules }) {
            if (includeGlobs.some(g => file.match(new RegExp(g.replace('**/*', '.*').replace('*', '.*'))))) {
                generateForFile(file);

                // Invalidate the virtual module
                const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
                if (mod) {
                    server.moduleGraph.invalidateModule(mod);
                }

                server.ws.send({
                    type: 'full-reload',
                    path: '*'
                });
            }
        },

        transformIndexHtml(html) {
            return [
                {
                    tag: 'script',
                    attrs: { type: 'module' },
                    children: `import '${VIRTUAL_MODULE_ID}';`,
                    injectTo: 'body'
                }
            ];
        }
    };
}
