import { Router, type Request, type Response } from 'express';

export const agentRouter = Router();

// ── Copilot Extension SSE helpers ──────────────────────────

function streamSSE(res: Response, content: string): void {
  // Copilot Extension protocol: SSE with ChatCompletion-style chunks
  const chunks = splitIntoChunks(content, 80);

  for (const chunk of chunks) {
    const payload = JSON.stringify({
      choices: [{ index: 0, delta: { content: chunk } }],
    });
    res.write(`data: ${payload}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks.length > 0 ? chunks : [''];
}

function setupSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
}

// ── Parse incoming Copilot Extension webhook ───────────────

interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface CopilotWebhookBody {
  messages?: CopilotMessage[];
}

function extractUserMessage(body: CopilotWebhookBody): string {
  if (!body.messages || body.messages.length === 0) {
    return '';
  }
  // The last user message is the current prompt
  const userMessages = body.messages.filter(m => m.role === 'user');
  return userMessages[userMessages.length - 1]?.content || '';
}

// ── Main webhook handler ───────────────────────────────────

agentRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as CopilotWebhookBody;
  const userMessage = extractUserMessage(body);
  const token = req.headers['x-github-token'] as string | undefined;

  setupSSEHeaders(res);

  // Phase 0: Echo-style response to prove the E2E works
  if (!userMessage) {
    streamSSE(res, '👋 Hi! I\'m the **WebMCP Auto-Instrumentor**. Send me a React component and I\'ll propose MCP tools for it.\n\nUsage: `@webmcp instrument` followed by pasting your component code.');
    return;
  }

  // Detect "instrument" command
  const isInstrument = /instrument/i.test(userMessage);

  if (isInstrument) {
    // For now, acknowledge the intent and show what's coming
    const response = [
      '🔍 **WebMCP Auto-Instrumentor**\n',
      'I detected an `instrument` request. Here\'s what I\'ll do:\n',
      '1. Parse your React/HTML component\n',
      '2. Identify interactive elements (forms, buttons, inputs)\n',
      '3. Classify risk level (safe / caution / destructive)\n',
      '4. Propose MCP tools for your review\n',
      '5. Generate handler code for the tools you select\n',
      '\n---\n',
      '⚙️ **Status:** Parser not yet connected (Phase 1).\n',
      'The server is running and the extension pipeline works end-to-end! 🎉\n',
      token ? '\n✅ GitHub token received — auth is working.' : '\n⚠️ No GitHub token received.',
    ].join('');

    streamSSE(res, response);
    return;
  }

  // Default: help message
  streamSSE(res, [
    '🤖 **WebMCP Auto-Instrumentor**\n\n',
    'Available commands:\n',
    '- `instrument` — Analyze a component and propose MCP tools\n',
    '- `help` — Show this message\n',
    '\nPaste a React component (.tsx/.jsx) or HTML file after the `instrument` command.',
  ].join(''));
});
