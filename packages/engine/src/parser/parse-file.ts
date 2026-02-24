import type { ComponentAnalysis, FrameworkType } from '../types.js';
import { extname } from 'node:path';
import { parseReactFile } from './react-parser.js';
import { parseHTMLFile } from './html-parser.js';
import { parseVueFile } from './vue-parser.js';

/**
 * Detect framework from file extension and parse accordingly.
 * Phase 1: React (.tsx/.jsx)
 * Phase 3: HTML (.html)
 */
export function parseFile(source: string, fileName: string): ComponentAnalysis {
  const ext = extname(fileName).toLowerCase();
  const framework = detectFramework(ext);

  switch (framework) {
    case 'react':
      return parseReactFile(source, fileName);
    case 'html':
      return parseHTMLFile(source, fileName);
    case 'vue':
      return parseVueFile(source, fileName);
    default:
      throw new Error(`Unsupported file type: ${ext}. Supported: .tsx, .jsx, .html`);
  }
}

function detectFramework(ext: string): FrameworkType | 'unknown' {
  switch (ext) {
    case '.tsx':
    case '.jsx':
      return 'react';
    case '.html':
    case '.htm':
      return 'html';
    case '.vue':
      return 'vue';
    default:
      return 'unknown';
  }
}

function createEmptyAnalysis(fileName: string, framework: FrameworkType): ComponentAnalysis {
  return { fileName, framework, components: [] };
}
