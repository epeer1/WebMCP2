import { OpenAIAdapter, GitHubModelsAdapter, OllamaAdapter } from './adapters.js';
import { NoneAdapter } from './none-adapter.js';
import type { LLMAdapter } from '../types.js';
import { execSync } from 'node:child_process';

/**
 * Auto-detect the best available LLM backend.
 * Priority: explicit flag > OpenAI env > GitHub Models (gh CLI) > Ollama > None
 */
export async function detectLLMBackend(explicit?: string, model?: string): Promise<LLMAdapter> {
    if (explicit) return createFromExplicit(explicit, model);

    // 1. OpenAI env var
    if (process.env.OPENAI_API_KEY) {
        const adapter = new OpenAIAdapter(process.env.OPENAI_API_KEY, model ?? 'gpt-4o-mini');
        return adapter;
    }

    // 2. GitHub Models via gh CLI token
    const ghToken = getGhToken();
    if (ghToken) {
        const adapter = new GitHubModelsAdapter(ghToken, model ?? 'gpt-4o-mini');
        const ok = await testGitHubModels(ghToken);
        if (ok) return adapter;
    }

    // 3. Ollama running locally
    const ollamaURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    const ollamaModel = model ?? process.env.OLLAMA_MODEL ?? 'llama3';
    const ollama = new OllamaAdapter(ollamaURL, ollamaModel);
    if (await ollama.isAvailable()) return ollama;

    // 4. Fallback — template only
    return new NoneAdapter();
}

function createFromExplicit(backend: string, model?: string): LLMAdapter {
    switch (backend.toLowerCase()) {
        case 'openai': {
            const key = process.env.OPENAI_API_KEY;
            if (!key) throw new Error('--llm openai requires OPENAI_API_KEY env var');
            return new OpenAIAdapter(key, model ?? 'gpt-4o-mini');
        }
        case 'github-models':
        case 'github': {
            const token = getGhToken();
            if (!token) throw new Error('--llm github-models requires `gh auth login`');
            return new GitHubModelsAdapter(token, model ?? 'gpt-4o-mini');
        }
        case 'ollama': {
            const url = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
            return new OllamaAdapter(url, model ?? process.env.OLLAMA_MODEL ?? 'llama3');
        }
        case 'none':
            return new NoneAdapter();
        default:
            throw new Error(`Unknown LLM backend: "${backend}". Valid: openai, github-models, ollama, none`);
    }
}

function getGhToken(): string | null {
    // 1. Env var
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
    // 2. gh CLI
    try {
        const token = execSync('gh auth token', { stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 })
            .toString()
            .trim();
        return token || null;
    } catch {
        return null;
    }
}

async function testGitHubModels(token: string): Promise<boolean> {
    try {
        const res = await fetch('https://models.inference.ai.azure.com/models', {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
