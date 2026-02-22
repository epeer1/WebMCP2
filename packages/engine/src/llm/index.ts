// LLM Adapters — entry point
export type { LLMAdapter, LLMMessage, LLMOptions } from '../types.js';
export { NoneAdapter } from './none-adapter.js';
export { OpenAIAdapter, GitHubModelsAdapter, OllamaAdapter } from './adapters.js';
export { detectLLMBackend } from './detect.js';
