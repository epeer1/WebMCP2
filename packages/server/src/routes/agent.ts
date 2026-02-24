import { Router, type Request, type Response } from 'express';
import { parseFile } from 'webmcp-instrument-engine/parser';
import { buildProposals } from 'webmcp-instrument-engine/proposal';
import { NoneAdapter } from 'webmcp-instrument-engine/llm';
import { generateMCPCode } from 'webmcp-instrument-engine/generator';
import { createHash } from 'node:crypto';
import { cacheProposal, getLatestProposal } from '../state/proposal-cache.js';
import type { ToolProposal } from 'webmcp-instrument-engine';

export const agentRouter = Router();

// ── SSE helpers ───────────────────────────────────────────────

function setupSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

function streamSSE(res: Response, content: string): void {
  const chunks = splitIntoChunks(content, 80);
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: chunk } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) chunks.push(text.slice(i, i + maxLen));
  return chunks.length > 0 ? chunks : [''];
}

// ── Copilot webhook body ──────────────────────────────────────

interface CopilotMessage { role: 'user' | 'assistant' | 'system'; content: string; }
interface CopilotBody { messages?: CopilotMessage[]; }

function getLastUserMessage(body: CopilotBody): string {
  const msgs = (body.messages ?? []).filter(m => m.role === 'user');
  return msgs[msgs.length - 1]?.content ?? '';
}

function extractUserId(req: Request): string {
  return (req.headers['x-github-token'] as string)?.slice(0, 16) ?? req.ip ?? 'anon';
}

// ── Intent detection ──────────────────────────────────────────

function isInstrumentCommand(msg: string): boolean {
  return /instrument|analyze|scan|parse/i.test(msg);
}

function isSelectionResponse(msg: string): boolean {
  // Matches "1,2,3" or "all" or "1 2 3" or "yes" or "generate 1,2"
  return /^(all|yes|\d[\d,\s]*)$/i.test(msg.trim()) ||
    /generate\s+(all|\d[\d,\s]*)/i.test(msg);
}

function parseSelection(msg: string, maxIndex: number): number[] | 'all' {
  if (/all|yes/i.test(msg)) return 'all';
  const nums = msg.match(/\d+/g)?.map(Number).filter(n => n >= 1 && n <= maxIndex) ?? [];
  return nums;
}

function extractSourceCode(msg: string): string | null {
  // Look for code block ```tsx\n...\n``` or raw JSX/HTML
  const fence = msg.match(/```(?:tsx?|jsx?|html?)?\s*\n([\s\S]+?)\n```/i);
  if (fence) return fence[1].trim();

  // Heuristic: message contains JSX-like content
  if (/<[A-Za-z]/.test(msg) && msg.length > 200) return msg;
  return null;
}

// ── Proposal markdown formatter ───────────────────────────────

function formatProposals(proposals: ToolProposal[]): string {
  const RISK_EMOJI: Record<string, string> = {
    safe: '🟢', caution: '🟡', destructive: '🔴', excluded: '⚫',
  };

  const lines = [
    '## 🔧 WebMCP Tool Proposals\n',
    'I found the following instrumentable actions:\n',
  ];

  for (const p of proposals) {
    const emoji = RISK_EMOJI[p.risk] ?? '⚪';
    const pre = p.selected ? '✅' : '⬜';
    const fields = Object.keys(p.inputSchema.properties).join(', ') || 'none';
    lines.push(`${pre} **[${p.index}] ${p.name}** ${emoji} \`${p.risk}\``);
    lines.push(`   ${p.description}`);
    lines.push(`   Fields: \`${fields}\``);
    lines.push('');
  }

  lines.push('---');
  lines.push('Reply with the tool numbers to generate (e.g. `1,2`) or `all` to generate all safe tools.');
  lines.push('Destructive tools (🔴) are unchecked by default — include their number explicitly to generate them.');

  return lines.join('\n');
}

// ── Main webhook handler ──────────────────────────────────────

agentRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as CopilotBody;
  const userMessage = getLastUserMessage(body);
  const userId = extractUserId(req);

  setupSSEHeaders(res);

  if (!userMessage) {
    streamSSE(res, '👋 **WebMCP Auto-Instrumentor**\n\nSend me a React component to instrument:\n```\n@webmcp instrument\n```tsx\n// paste your component here\n```\n```');
    return;
  }

  // ── Turn 1: Instrument command + source code ────────────────
  if (isInstrumentCommand(userMessage)) {
    const sourceCode = extractSourceCode(userMessage);

    if (!sourceCode) {
      streamSSE(res, '🔍 **WebMCP Auto-Instrumentor**\n\nPlease paste your component code after the `instrument` command:\n\n````\n@webmcp instrument\n```tsx\nexport default function MyForm() { ... }\n```\n````');
      return;
    }

    try {
      // Detect file type (tsx by default)
      const fileName = 'component.tsx';
      const analysis = parseFile(sourceCode, fileName);
      const proposals = buildProposals(analysis);

      if (proposals.length === 0) {
        streamSSE(res, '⚠️ **No instrumentable elements found**\n\nThis component has no forms, buttons, or interactive elements that can be wrapped as MCP tools.\n\nTry pointing at a specific page or form component.');
        return;
      }

      // Cache proposals for the follow-up turn
      const hash = createHash('sha256').update(sourceCode).digest('hex').slice(0, 12);
      cacheProposal(userId, hash, { proposals, analysis, sourceCode, sourceHash: hash });

      streamSSE(res, formatProposals(proposals));
    } catch (err) {
      streamSSE(res, `❌ **Parse error**\n\n\`${(err as Error).message}\`\n\nMake sure you're pasting valid .tsx or .jsx source code.`);
    }
    return;
  }

  // ── Turn 2: User replied with selection ─────────────────────
  if (isSelectionResponse(userMessage)) {
    const cached = getLatestProposal(userId);

    if (!cached) {
      streamSSE(res, '⏲️ **No active proposal found**\n\nYour tool proposal may have expired (5 min timeout). Run `@webmcp instrument` again to get a fresh proposal.');
      return;
    }

    const selectionResult = parseSelection(userMessage, cached.proposals.length);
    const selected = selectionResult === 'all'
      ? cached.proposals.filter(p => p.risk !== 'excluded')
      : cached.proposals.filter(p =>
        Array.isArray(selectionResult) && selectionResult.includes(p.index)
      );

    if (selected.length === 0) {
      streamSSE(res, '⚠️ **No valid tools selected.**\n\nPlease reply with tool numbers (e.g. `1,2`) or `all`.');
      return;
    }

    try {
      const llm = new NoneAdapter();
      const code = await generateMCPCode(selected, {
        format: 'iife',
        framework: cached.analysis.framework,
        llm,
      });

      const response = [
        `✅ **Generated ${selected.length} MCP tool(s)**\n`,
        `\`\`\`javascript\n${code}\n\`\`\`\n`,
        `Add \`<script src="https://unpkg.com/webmcp-instrument-runtime"></script>\` to your page, then include this file.`,
      ].join('\n');

      streamSSE(res, response);
    } catch (err) {
      streamSSE(res, `❌ **Code generation error**\n\n${(err as Error).message}`);
    }
    return;
  }

  // ── Default: help message ───────────────────────────────────
  streamSSE(res, [
    '🤖 **WebMCP Auto-Instrumentor**\n',
    'Commands:\n',
    '- `instrument` + paste your component → analyze and propose MCP tools\n',
    '- Reply with tool numbers (e.g. `1,2` or `all`) → generate handler code\n',
    '- `help` → show this message',
  ].join(''));
});
