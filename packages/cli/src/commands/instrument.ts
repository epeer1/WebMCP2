import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { parseFile } from '@webmcp/engine/parser';
import { generateMCPCode } from '@webmcp/engine/generator';

interface InstrumentOptions {
  output?: string;
  dryRun?: boolean;
  yes?: boolean;
  all?: boolean;
  select?: string;
  llm?: string;
  format?: string;
}

export async function instrumentCommand(
  file: string,
  options: InstrumentOptions,
): Promise<void> {
  const filePath = resolve(file);

  // 1. Validate file exists
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

  // 3. Check for instrumentable elements
  const totalElements = analysis.components.reduce(
    (sum, c) => sum + c.elements.length,
    0,
  );

  if (totalElements === 0) {
    console.log(
      chalk.yellow('\n⚠ No instrumentable elements found in this file.'),
    );
    console.log(chalk.gray('  This file has no forms, buttons, or interactive elements.\n'));

    if (options.dryRun) {
      console.log(chalk.gray('  Components found:'));
      for (const comp of analysis.components) {
        console.log(chalk.gray(`    - ${comp.name} (${comp.type})`));
      }
    }
    return;
  }

  // 4. Show analysis summary
  console.log(
    chalk.green(`\n✔ Found ${analysis.components.length} component(s), ${totalElements} interactive element(s)\n`),
  );

  for (const comp of analysis.components) {
    console.log(chalk.white(`  ${comp.name}`));
    console.log(chalk.gray(`    Type: ${comp.type}`));
    console.log(chalk.gray(`    Elements: ${comp.elements.length}`));
    console.log(chalk.gray(`    Handlers: ${comp.eventHandlers.length}`));
    console.log(chalk.gray(`    State vars: ${comp.stateVariables.length}`));
    console.log('');
  }

  if (options.dryRun) {
    console.log(chalk.blue('ℹ Dry run mode — no files written.\n'));
    console.log(chalk.gray('  Phase 1 will add risk classification and tool proposals here.\n'));
    return;
  }

  // Phase 1+2 will add: proposal → selection → code generation
  console.log(chalk.blue('ℹ Tool proposal and code generation coming in Phase 1-2.\n'));
}
