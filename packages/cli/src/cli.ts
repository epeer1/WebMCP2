#!/usr/bin/env node

import { program } from 'commander';
import { instrumentCommand } from './commands/instrument.js';
import { initCommand } from './commands/init.js';

program
  .name('webmcp')
  .description('Auto-instrument web apps with WebMCP tools for AI agents')
  .version('0.1.0');

program
  .command('instrument')
  .description('Analyze a component file and generate MCP tool registrations')
  .argument('<file>', 'Path to the component file (.tsx, .jsx, .html)')
  .option('-o, --output <path>', 'Output file path (default: <file>.mcp.js)')
  .option('--dry-run', 'Show proposed tools without generating code')
  .option('--yes', 'Accept all safe + caution tools without prompting')
  .option('--all', 'Accept all tools including destructive (use with caution)')
  .option('--select <indices>', 'Comma-separated indices of tools to generate (e.g., "1,3,5")')
  .option('--llm <backend>', 'LLM backend: openai | github-models | ollama | none')
  .option('--model <name>', 'Model name for the chosen LLM backend (e.g. gpt-4o, llama3, phi3)')
  .option('--format <format>', 'Output format: iife | esm | auto', 'auto')
  .option('--url <url>', 'Local dev server URL for the headless runtime probe', 'http://localhost:3000')
  .action(instrumentCommand);

program
  .command('init')
  .description('Initialize WebMCP in the current project (creates .webmcprc.json)')
  .option('--force', 'Overwrite existing .webmcprc.json if present')
  .action(initCommand);

program.parse();
