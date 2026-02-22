import { writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';

const DEFAULT_CONFIG = `{
  "classification": {
    "destructive": "include-with-warning",
    "navigation": "exclude"
  },
  "output": {
    "format": "iife",
    "fileExtension": ".mcp.js"
  },
  "llm": {
    "backend": "auto",
    "model": "gpt-4o-mini",
    "temperature": 0.1
  },
  "specVersion": "0.1"
}
`;

const GITIGNORE_ENTRY = '\n# WebMCP — do not commit generated tool files\n*.mcp.js\n*.mcp.ts\n';

interface InitOptions {
    force?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
    const cwd = process.cwd();
    const configPath = resolve(cwd, '.webmcprc.json');
    const gitignorePath = resolve(cwd, '.gitignore');

    console.log(chalk.blue('\n🔧 WebMCP Init\n'));

    // 1. Write .webmcprc.json
    const configExists = existsSync(configPath);
    if (configExists && !options.force) {
        console.log(chalk.yellow('⚠ .webmcprc.json already exists — use --force to overwrite.'));
    } else {
        const spinner = ora('Writing .webmcprc.json...').start();
        try {
            writeFileSync(configPath, DEFAULT_CONFIG, 'utf-8');
            spinner.succeed(chalk.green('Created .webmcprc.json'));
        } catch (err) {
            spinner.fail(`Failed to write .webmcprc.json: ${(err as Error).message}`);
        }
    }

    // 2. Update .gitignore
    if (existsSync(gitignorePath)) {
        const { readFileSync, appendFileSync } = await import('node:fs');
        const gitignore = readFileSync(gitignorePath, 'utf-8');
        if (!gitignore.includes('*.mcp.js')) {
            appendFileSync(gitignorePath, GITIGNORE_ENTRY);
            console.log(chalk.green('✔ Added *.mcp.js to .gitignore'));
        } else {
            console.log(chalk.gray('  .gitignore already has *.mcp.js entry'));
        }
    }

    // 3. Print next steps
    console.log(chalk.bold('\n✅ WebMCP is ready!\n'));
    console.log('Next steps:');
    console.log(chalk.cyan('  1.') + ' Point it at a React component:');
    console.log(chalk.white('       webmcp instrument src/components/MyForm.tsx'));
    console.log(chalk.cyan('  2.') + ' Or dry-run first to preview proposals:');
    console.log(chalk.white('       webmcp instrument src/components/MyForm.tsx --dry-run'));
    console.log(chalk.cyan('  3.') + ' For LLM-assisted generation, set your key:');
    console.log(chalk.white('       export OPENAI_API_KEY=sk-...'));
    console.log(chalk.white('       # or: gh auth login   ← uses GitHub Models (free)'));
    console.log('');
    console.log(chalk.gray('  Docs: https://github.com/epeer1/WebMCP2#readme\n'));
}
