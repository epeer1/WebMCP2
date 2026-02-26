import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { checkbox } from '@inquirer/prompts';
import {
  parseFile,
  buildProposals,
  generateMCPCode,
  detectLLMBackend,
  WebMCPError,
  formatError,
  loadConfig,
  type OutputFormat,
  type ToolProposal,
} from 'webmcp-instrument-engine';

interface InstrumentOptions {
  output?: string;
  dryRun?: boolean;
  yes?: boolean;
  all?: boolean;
  select?: string;
  llm?: string;
  model?: string;
  format?: string;
  url?: string;
}

const RISK_BADGE: Record<string, string> = {
  safe: chalk.green('[safe]'),
  caution: chalk.yellow('[caution]'),
  destructive: chalk.red('[destructive]'),
  excluded: chalk.gray('[excluded]'),
};

export async function instrumentCommand(
  file: string,
  options: InstrumentOptions,
): Promise<void> {
  const filePath = resolve(file);

  // 1. Validate file
  if (!existsSync(filePath)) {
    console.error(chalk.red(`\n✖ File not found: ${filePath} `));
    console.error(chalk.gray('  Check the path and try again.\n'));
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.html', '.htm'].includes(ext)) {
    console.error(chalk.red(`\n✖ Unsupported file type: ${ext} `));
    console.error(chalk.gray('  Supported: .tsx, .jsx, .html\n'));
    process.exit(1);
  }

  // 2. Detect LLM backend
  const llmSpinner = ora('Detecting LLM backend...').start();
  const llm = await detectLLMBackend(options.llm, options.model).catch(() => {
    const { NoneAdapter } = require('webmcp-instrument-engine/llm');
    return new NoneAdapter();
  });
  llmSpinner.succeed(`Using: ${chalk.cyan(llm.name)} `);

  // 3. Parse
  const spinner = ora('Parsing component...').start();
  let source: string;
  try {
    source = readFileSync(filePath, 'utf-8');
  } catch (err) {
    spinner.fail('Failed to read file');
    process.exit(1);
  }

  const analysis = parseFile(source, basename(filePath));
  spinner.succeed(`Parsed ${chalk.white(basename(filePath))} (${analysis.framework})`);

  // 4. Run Dev-Mode Probe (if url provided)
  const devUrl = options.url ?? 'http://localhost:3000'; // Defaulting for now, will be arg
  const probeSpinner = ora(`Running headless ground-truth probe on ${devUrl}...`).start();
  let probeElements: any[] = [];
  try {
    const { runProbe } = await import('webmcp-instrument-engine');
    const probeResult = await runProbe(devUrl, { headless: true, timeoutMs: 5000 });
    probeElements = probeResult.elements;
    probeSpinner.succeed(`Probe extracted ${probeElements.length} interactive elements from DOM`);
  } catch (err) {
    probeSpinner.warn(`Probe failed (${(err as Error).message}) — falling back to pure AST heuristics`);
  }

  // 5. Match AST to Runtime
  if (probeElements.length > 0) {
    const matchSpinner = ora('Synthesizing selector strategies...').start();
    const { matchElementsToProbe } = await import('webmcp-instrument-engine');

    // Flat map all elements to match
    const allAstElements = analysis.components.flatMap(c => c.elements);
    matchElementsToProbe(allAstElements, probeElements);

    matchSpinner.succeed('Synthesized fallback strategies (Confidence thresholds applied)');
  }

  // 6. Build proposals
  const proposals = buildProposals(analysis);

  if (proposals.length === 0) {
    console.log(chalk.yellow('\n⚠ No instrumentable elements found.'));
    console.log(chalk.gray('  This file has no forms, buttons, or interactive elements.\n'));
    return;
  }

  // Pre-flight warning check for unstable selectors
  const unstable = proposals.filter(p => p.isStable === false);
  if (unstable.length > 0) {
    console.log(chalk.yellow(`\n⚠ Warning: ${unstable.length} tool(s) failed the Confidence Threshold (< 0.6)`));
    console.log(chalk.gray(`  WebMCP recommends adding stable \`data-mcp\` or \`data-testid\` attributes to these components.`));
  }

  // 5. Print proposal table
  console.log(chalk.green(`\n✔ Found ${proposals.length} tool proposal(s) \n`));
  printProposalTable(proposals);

  if (options.dryRun) {
    console.log(chalk.blue('\nℹ Dry run — no files written.\n'));
    return;
  }

  // 6. Select tools
  let selected: ToolProposal[];

  if (options.yes) {
    selected = proposals.filter(p => p.risk !== 'destructive' && p.risk !== 'excluded');
    console.log(chalk.blue(`ℹ Auto - selecting ${selected.length} safe / caution tool(s).\n`));
  } else if (options.all) {
    selected = proposals.filter(p => p.risk !== 'excluded');
    console.log(chalk.blue(`ℹ Selecting all ${selected.length} tool(s).\n`));
  } else if (options.select) {
    const indices = options.select.split(',').map(Number);
    selected = proposals.filter(p => indices.includes(p.index));
  } else {
    // Interactive checkbox picker
    const choices = proposals
      .filter(p => p.risk !== 'excluded')
      .map(p => ({
        name: `${RISK_BADGE[p.risk]} [${p.index}] ${p.name} — ${p.description} `,
        value: p.index,
        checked: p.selected,
      }));

    const selectedIndices = await checkbox({
      message: 'Select tools to generate:',
      choices,
    });

    selected = proposals.filter(p => selectedIndices.includes(p.index));
  }

  if (selected.length === 0) {
    console.log(chalk.yellow('No tools selected — nothing generated.\n'));
    return;
  }

  // 7. Generate
  const genSpinner = ora(`Generating ${selected.length} tool(s) with ${llm.name}...`).start();
  let code: string;
  try {
    code = await generateMCPCode(selected, {
      format: options.format === 'auto'
        ? (options.output?.endsWith('.ts') ? 'esm' : 'iife')
        : options.format as OutputFormat,
      framework: analysis.framework,
      llm,
    });
    genSpinner.succeed(`Generated ${selected.length} tool(s)`);
  } catch (err) {
    genSpinner.fail(`Generation error: ${(err as Error).message} `);
    process.exit(1);
  }

  // 8. Write output
  const outputPath = options.output ?? deriveOutputPath(filePath);
  writeFileSync(outputPath, code, 'utf-8');

  console.log(chalk.green(`\n📄 Written to: ${outputPath} \n`));
  console.log(chalk.gray('  Next steps:'));
  console.log(chalk.gray('  1. Add <script src="https://unpkg.com/webmcp-instrument-runtime"></script> to your page'));
  console.log(chalk.gray(`  2. Add < script src = "${basename(outputPath)}" > </script> after the runtime\n`));
}

// ── Helpers ───────────────────────────────────────────────────

function printProposalTable(proposals: ToolProposal[]): void {
  for (const p of proposals) {
    const badge = RISK_BADGE[p.risk] ?? '';
    const check = p.selected ? chalk.green('●') : chalk.gray('○');
    const fields = Object.keys(p.inputSchema.properties).join(', ') || '(no inputs)';
    console.log(`  ${check} ${chalk.bold(`[${p.index}]`)} ${chalk.white(p.name)} ${badge}`);
    console.log(`       ${chalk.gray(p.description)}`);
    console.log(`       ${chalk.gray('Fields:')} ${chalk.cyan(fields)}`);
    if (p.riskReason) console.log(`       ${chalk.gray('Reason:')} ${chalk.dim(p.riskReason)}`);
    console.log('');
  }
}

function deriveOutputPath(filePath: string): string {
  return filePath.replace(/\.(tsx?|jsx?)$/, '.mcp.js');
}
