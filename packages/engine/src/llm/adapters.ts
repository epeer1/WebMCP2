import type { LLMAdapter, LLMMessage, LLMOptions } from '../types.js';

// ── OpenAI Adapter ────────────────────────────────────────────

export class OpenAIAdapter implements LLMAdapter {
    readonly name = 'OpenAI';
    private apiKey: string;
    private model: string;
    private baseURL: string;

    constructor(apiKey: string, model = 'gpt-4o-mini', baseURL = 'https://api.openai.com/v1') {
        this.apiKey = apiKey;
        this.model = model;
        this.baseURL = baseURL;
    }

    async generate(messages: LLMMessage[], options?: LLMOptions): Promise<string> {
        const res = await this.call(messages, options);
        return res.choices[0]?.message?.content ?? '';
    }

    async generateJSON<T>(messages: LLMMessage[], options?: LLMOptions): Promise<T> {
        const opts: LLMOptions = { ...options, responseFormat: 'json' };
        const text = await this.generate(messages, opts);
        try {
            // Strip markdown code fences if present
            const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
            return JSON.parse(cleaned) as T;
        } catch {
            throw new Error(`[OpenAIAdapter] Failed to parse JSON response: ${text.slice(0, 200)}`);
        }
    }

    async isAvailable(): Promise<boolean> {
        return !!this.apiKey;
    }

    private async call(messages: LLMMessage[], options?: LLMOptions) {
        const body: Record<string, unknown> = {
            model: this.model,
            messages,
            temperature: options?.temperature ?? 0.2,
            max_tokens: options?.maxTokens ?? 2000,
        };

        if (options?.responseFormat === 'json') {
            body['response_format'] = { type: 'json_object' };
        }

        const res = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`[OpenAIAdapter] API error ${res.status}: ${err}`);
        }

        return res.json() as Promise<{ choices: { message: { content: string } }[] }>;
    }
}

// ── GitHub Models Adapter — reuses OpenAI SDK compat endpoint ─

export class GitHubModelsAdapter extends OpenAIAdapter {
    constructor(token: string, model = 'gpt-4o-mini') {
        super(token, model, 'https://models.inference.ai.azure.com');
        (this as any).name = `GitHub Models (${model})`;
    }
}

// ── Ollama Adapter ────────────────────────────────────────────

export class OllamaAdapter implements LLMAdapter {
    readonly name: string;
    private baseURL: string;
    private model: string;

    constructor(baseURL = 'http://localhost:11434', model = 'llama3') {
        this.baseURL = baseURL;
        this.model = model;
        this.name = `Ollama (${model})`;
    }

    async generate(messages: LLMMessage[], options?: LLMOptions): Promise<string> {
        const res = await fetch(`${this.baseURL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                messages,
                stream: false,
                options: {
                    temperature: options?.temperature ?? 0.2,
                    num_predict: options?.maxTokens ?? 2000,
                },
            }),
        });

        if (!res.ok) {
            throw new Error(`[OllamaAdapter] API error ${res.status}: ${await res.text()}`);
        }

        const data = await res.json() as { message?: { content?: string } };
        return data.message?.content ?? '';
    }

    async generateJSON<T>(messages: LLMMessage[], options?: LLMOptions): Promise<T> {
        // Append JSON instruction to the last user message
        const augmented = messages.map((m, i) =>
            i === messages.length - 1 && m.role === 'user'
                ? { ...m, content: m.content + '\n\nRespond with valid JSON only. No explanation, no markdown.' }
                : m
        );
        const text = await this.generate(augmented, options);
        try {
            const cleaned = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
            return JSON.parse(cleaned) as T;
        } catch {
            throw new Error(`[OllamaAdapter] Failed to parse JSON response: ${text.slice(0, 200)}`);
        }
    }

    async isAvailable(): Promise<boolean> {
        try {
            const res = await fetch(`${this.baseURL}/api/tags`, { signal: AbortSignal.timeout(2000) });
            return res.ok;
        } catch {
            return false;
        }
    }
}
