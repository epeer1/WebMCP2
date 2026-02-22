import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { parseFile } from '@webmcp/engine/parser';
import { buildProposals } from '@webmcp/engine/proposal';
import { generateMCPCode } from '@webmcp/engine/generator';
import type { ToolProposal } from '@webmcp/engine';

interface InstrumentOptions {
  output?: string;
  dryRun?: boolean;
  yes?: boolean;
  all?: boolean;
  select?: string;
  llm?: string;
  format?: string;
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
    console.error(chalk.red(`\n✖ File not found: ${filePath}`));
    console.error(chalk.gray('  Check the path and try again.\n'));
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.html', '.htm'].includes(ext)) {
    console.error(chalk.red(`\n✖ Unsupported file type: ${ext}`));
    console.error(chalk.gray('  Supported: .tsx, .jsx, .html\n'));
    process.exit(1);
  }

  // 2. Parse
  const spinner = ora('Parsing component...').start();
  let source: string;
  try {
    source = readFileSync(filePath, 'utf-8');
  } catch (err) {
    spinner.fail('Failed to read file');
    console.error(chalk.red(`  ${(err as Error).message}`));
    process.exit(1);
  }

  const analysis = parseFile(source, basename(filePath));
  spinner.succeed(`Parsed ${basename(filePath)} (${analysis.framework})`);

  // 3. Build proposals
  const proposals = buildProposals(analysis);

  if (proposals.length === 0) {
    console.log(chalk.yellow('\n⚠ No instrumentable elements found in this file.'));
    console.log(chalk.gray('  This file has no forms, buttons, or interactive elements.\n'));
    return;
  }

  // 4. Print proposal table
  console.log(chalk.green(`\n✔ Found ${proposals.length} tool proposal(s)\n`));
  printProposalTable(proposals);

  if (options.dryRun) {
    console.log(chalk.blue('\nℹ Dry run mode — no files written.'));
    console.log(chalk.gray('  Run without --dry-run to generate .mcp.js output.\n'));
    return;
  }

  // 5. Select tools
  let selected: ToolProposal[];

  if (options.yes) {
    selected = proposals.filter(p => p.risk !== 'destructive');
  } else if (options.all) {
    selected = proposals;
  } else if (options.select) {
    const indices = options.select.split(',').map(Number);
    selected = proposals.filter(p => indices.includes(p.index));
  } else {
    // Default: pre-selected (safe + caution)
    selected = proposals.filter(p => p.selected);
    console.log(chalk.blue(`ℹ Auto-selecting ${selected.length} tool(s). Use --all to include destructive.\n`));
  }

  if (selected.length === 0) {
    console.log(chalk.yellow('No tools selected. Nothing generated.\n'));
    return;
  }

  // 6. Generate
  const genSpinner = ora(`Generating ${selected.length} tool(s)...`).start();
  const code = generateMCPCode(selected, {
    format: 'iife',
    framework: analysis.framework,
  });
  genSpinner.succeed(`Generated ${selected.length} tool(s)`);

  // 7. Write
  const outputPath = options.output ?? deriveOutputPath(filePath);
  writeFileSync(outputPath, code, 'utf-8');
  console.log(chalk.green(`\n📄 Output written to: ${outputPath}\n`));
  console.log(chalk.gray('  Add <script src="@webmcp/runtime"></script> to your page to enable window.mcp\n'));
}

function printProposalTable(proposals: ToolProposal[]): void {
  for (const p of proposals) {
    const badge = RISK_BADGE[p.risk] ?? '';
    const check = p.selected ? chalk.green('●') : chalk.gray('○');
    const fields = Object.keys(p.inputSchema.properties).join(', ') || '(no inputs)';
    console.log(`  ${check} ${chalk.bold(`[${p.index}]`)} ${chalk.white(p.name)} ${badge}`);
    console.log(`       ${chalk.gray(p.description)}`);
    console.log(`       ${chalk.gray('Fields:')} ${chalk.cyan(fields)}`);
    if (p.riskReason) {
      console.log(`       ${chalk.gray('Reason:')} ${chalk.dim(p.riskReason)}`);
    }
    console.log('');
  }
}

function deriveOutputPath(filePath: string): string {
  return filePath.replace(/\.(tsx?|jsx?)$/, '.mcp.js');
}
