# WebMCP Auto-Instrumentor — Implementation Design

> Phase-by-phase architecture, exact implementation specs, blockers, and gap analysis.
> This document turns [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md) into actionable engineering work.

---

## Implementation Readiness Assessment

### Is the plan ready to build?

**Verdict: 85% ready.** The plan is strong on *what* to build and *why*, but has gaps in *how* at the implementation level. This document fills those gaps.

### Critical Blockers (Must Resolve Before Coding)

| # | Blocker | Impact | Resolution |
|---|---------|--------|------------|
| 1 | **WebMCP runtime doesn't exist yet as a published spec** | `window.mcp.registerTool()` API may not be real — there's no npm package, no browser runtime | We must **ship our own lightweight runtime** (`@webmcp/runtime`) that pages include. This is actually an advantage — we define the interface. See Phase 0 design below. |
| 2 | **Copilot Extensions multi-turn conversation** | The plan assumes the Extension can send a proposal, wait for user reply, then generate. Copilot Extensions are **stateless webhooks** — each POST is independent with no session memory. | Server must store proposal state (keyed by user + file hash) in a short-lived cache (in-memory Map with TTL, or Redis for multi-instance). The second POST includes the selection, server retrieves cached proposal. See Phase 2 design. |
| 3 | **Copilot Extension SDK is "preview"** | The SDK package `@github/copilot-extensions-preview-sdk` may change or not exist by build time | Verify SDK availability at project start. If unavailable, implement the raw webhook protocol directly (it's documented: SSE streaming over HTTP). Wrap in adapter either way. |
| 4 | **`window.mcp` doesn't exist in any browser** | Generated code calls `window.mcp.registerTool()` but nothing provides that global | Ship `@webmcp/runtime` — a small (<2KB) script that creates `window.mcp`, exposes `registerTool()`, and handles agent discovery. This becomes a companion package. |

### Scenarios Not Yet Covered

| # | Scenario | Gap | Priority |
|---|----------|-----|----------|
| 1 | **React forms using third-party UI libraries** (MUI, Chakra, Ant Design, Radix) | These use custom components (`<TextField>`, `<Input>`) not `<input>`. AST parser won't find standard HTML elements. | HIGH — very common in real apps |
| 2 | **React Hook Form / Formik / Zod-based forms** | Form state is managed by a library, not `useState`. No `useState` bindings to trace. | HIGH — majority of production React forms |
| 3 | **Next.js Server Components** | Files with `"use server"` or RSC patterns. Server Components have no DOM — can't be instrumented. | MEDIUM — must detect and skip with helpful message |
| 4 | **Components without IDs** | Most React devs don't put `id` on elements. DOM selectors in generated handlers won't work. | HIGH — need fallback selector strategy |
| 5 | **Shadow DOM / Web Components** | `document.querySelector` can't reach inside shadow roots | LOW — uncommon in target audience |
| 6 | **Multi-step forms (wizards)** | Form spans multiple components/steps. Single-file analysis misses the full picture. | MEDIUM — v2 candidate |
| 7 | **Forms with dynamic fields** | Fields added/removed based on state (e.g., "add another address"). Schema varies at runtime. | LOW — edge case, document limitation |
| 8 | **TypeScript strict mode issues in generated `.mcp.ts`** | Generated code must pass `tsc` in the user's project with their tsconfig settings | MEDIUM — generate `.mcp.js` with JSDoc types as safer default |

### Resolution for High-Priority Gaps

#### Gap 1 & 2: Third-party UI libraries & form libraries

The AST parser needs a **component resolution layer** that maps common library components to their underlying behavior:

```ts
// src/engine/parser/component-map.ts
const KNOWN_INPUT_COMPONENTS: Record<string, { tag: 'input' | 'select' | 'textarea'; props: Record<string, string> }> = {
  // Material UI
  'TextField':     { tag: 'input', props: { value: 'value', onChange: 'onChange', label: 'label' } },
  'Select':        { tag: 'select', props: { value: 'value', onChange: 'onChange' } },
  'Checkbox':      { tag: 'input', props: { checked: 'checked', onChange: 'onChange' } },
  // Chakra UI
  'Input':         { tag: 'input', props: { value: 'value', onChange: 'onChange' } },
  'Textarea':      { tag: 'textarea', props: { value: 'value', onChange: 'onChange' } },
  // Ant Design
  'Input':         { tag: 'input', props: { value: 'value', onChange: 'onChange' } },
  'InputNumber':   { tag: 'input', props: { value: 'value', onChange: 'onChange' } },
  // Radix / shadcn
  'Input':         { tag: 'input', props: { value: 'value', onChange: 'onChange' } },
};

// For form libraries, detect the pattern:
const FORM_LIBRARY_PATTERNS = {
  'react-hook-form': {
    detect: (source: string) => source.includes('useForm') || source.includes('register('),
    extractFields: 'parseRHFFields' // custom extractor
  },
  'formik': {
    detect: (source: string) => source.includes('useFormik') || source.includes('<Formik'),
    extractFields: 'parseFormikFields'
  }
};
```

This is **additive** — it doesn't change the architecture, just extends the parser. Add to Phase 1.

#### Gap 4: Components without IDs

Generated handlers need a **selector strategy** with fallbacks:

```ts
// Priority order for finding an element:
// 1. id             → '#email'
// 2. data-testid    → '[data-testid="email-input"]'
// 3. name           → '[name="email"]'
// 4. aria-label     → '[aria-label="Email address"]'
// 5. form position  → 'form:nth-of-type(1) input:nth-of-type(2)'
// 6. label text     → computed via label[for] or wrapping label

function buildSelector(el: UIElement): string {
  if (el.id) return `#${el.id}`;
  if (el.attributes['data-testid']) return `[data-testid="${el.attributes['data-testid']}"]`;
  if (el.name) return `[name="${el.name}"]`;
  if (el.accessibilityHints?.ariaLabel) return `[aria-label="${el.accessibilityHints.ariaLabel}"]`;
  // Fallback to positional — less stable but works
  return `/* TODO: Add id or data-testid to this element for stable selection */`;
}
```

Bake this into the code generator from Phase 2.

---

## Phase 0 — Foundation

**Duration:** Week 1-2  
**Goal:** Working repo with CI, types, server skeleton, and the WebMCP runtime companion package.

### Architecture

```
webmcp/                          (monorepo root — npm workspaces)
├── packages/
│   ├── cli/                     (npm: webmcp)
│   │   ├── package.json
│   │   └── src/
│   ├── server/                  (Copilot Extension server)
│   │   ├── package.json
│   │   └── src/
│   ├── engine/                  (shared core — parser, classifier, generator)
│   │   ├── package.json
│   │   └── src/
│   └── runtime/                 (npm: @webmcp/runtime — browser-side)
│       ├── package.json
│       └── src/
├── test/
│   └── fixtures/
├── package.json                 (workspace root)
├── tsconfig.base.json
└── turbo.json                   (or nx.json — build orchestration)
```

**Why monorepo now?** Three reasons:
1. The engine code is shared between CLI and server — extracting it avoids duplication
2. The runtime is a separate publishable package users include in their app
3. Monorepo tooling (Turborepo) handles build ordering and caching

### Deliverables

#### D0.1: Repository & Tooling Setup

```json
// package.json (root)
{
  "name": "webmcp-monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "dev:server": "turbo run dev --filter=@webmcp/server",
    "dev:cli": "turbo run dev --filter=webmcp"
  },
  "devDependencies": {
    "turbo": "^2.x",
    "typescript": "^5.x",
    "vitest": "^1.x",
    "eslint": "^9.x",
    "prettier": "^3.x"
  }
}
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

#### D0.2: Type Definitions (`packages/engine/src/types.ts`)

Exact copy of the interfaces from the tech plan — `ComponentAnalysis`, `ComponentInfo`, `UIElement`, `ToolProposal`, `EventHandler`, `StateVariable`, `PropDefinition`, `ToolRisk`.

Plus additional types not yet defined:

```ts
// Pipeline types
interface PipelineInput {
  sourceCode: string;
  fileName: string;
  fileType: 'tsx' | 'jsx' | 'html' | 'vue';
  userInstructions?: string;       // From CLI args or Copilot chat message
  config?: WebMCPConfig;           // Loaded from .webmcprc.json
}

interface PipelineOutput {
  proposals: ToolProposal[];       // After classification, before selection
  selectedTools?: ToolProposal[];  // After user selection
  generatedCode?: string;          // Final output code
  outputFormat: 'iife' | 'esm';   // .mcp.js vs .mcp.ts
  outputPath?: string;             // Where the file was written
  sourceHash: string;              // SHA-256 of input source
}

// LLM adapter interface — all backends implement this
interface LLMAdapter {
  name: string;
  generate(messages: LLMMessage[], options?: LLMOptions): Promise<string>;
  generateJSON<T>(messages: LLMMessage[], options?: LLMOptions): Promise<T>;
  isAvailable(): Promise<boolean>;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMOptions {
  temperature?: number;            // Default: 0.2 for schemas, 0.3 for handlers
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

// Config file
interface WebMCPConfig {
  classification?: {
    include?: string[];            // Glob patterns for tool names to always include
    exclude?: string[];            // Glob patterns to always exclude
    destructive?: 'exclude' | 'include-with-warning';
    navigation?: 'exclude' | 'include';
    customRules?: { match: string; risk: ToolRisk }[];
  };
  output?: {
    format?: 'iife' | 'esm' | 'auto';  // auto = detect from framework
    directory?: string;            // Output dir override
    fileExtension?: '.mcp.js' | '.mcp.ts';
  };
  llm?: {
    backend?: 'github-models' | 'openai' | 'ollama' | 'none';
    model?: string;                // Override default model
    temperature?: number;
  };
  specVersion?: string;            // WebMCP spec version to target
}
```

#### D0.3: WebMCP Runtime (`packages/runtime/`)

This is the **missing piece** the tech plan doesn't address — the browser-side library that makes `window.mcp.registerTool()` actually work.

```ts
// packages/runtime/src/index.ts
// Size target: <2KB minified+gzipped

interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (params: Record<string, unknown>) => Promise<{ success: boolean; message?: string; data?: unknown }>;
}

interface MCPRuntime {
  registerTool(tool: MCPTool): void;
  getTools(): MCPTool[];
  invokeTool(name: string, params: Record<string, unknown>): Promise<unknown>;
  readonly version: string;
}

// Create the global runtime
(function initMCPRuntime() {
  if (typeof window === 'undefined') return;
  if (window.mcp) return; // Already initialized

  const tools = new Map<string, MCPTool>();

  const runtime: MCPRuntime = {
    version: '__VERSION__', // Replaced at build time

    registerTool(tool: MCPTool) {
      if (tools.has(tool.name)) {
        console.warn(`[WebMCP] Tool "${tool.name}" already registered. Overwriting.`);
      }
      tools.set(tool.name, tool);
      // Dispatch event so agents can discover new tools
      window.dispatchEvent(new CustomEvent('mcp:tool-registered', { detail: { name: tool.name } }));
    },

    getTools() {
      return Array.from(tools.values()).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        handler: t.handler
      }));
    },

    async invokeTool(name: string, params: Record<string, unknown>) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`[WebMCP] Tool "${name}" not found`);
      return tool.handler(params);
    }
  };

  (window as any).mcp = runtime;
  window.dispatchEvent(new Event('mcp:ready'));
})();

// Type augmentation for TypeScript users
declare global {
  interface Window {
    mcp: MCPRuntime;
  }
}
```

**Why this matters:** Without this, *none* of the generated code works. The tech plan assumes `window.mcp` exists but never defines who provides it. We do.

**Distribution:**
- npm: `npm install @webmcp/runtime`
- CDN: `<script src="https://unpkg.com/@webmcp/runtime"></script>`
- The CLI's generated output includes an inline comment: `// Requires: @webmcp/runtime — see https://github.com/user/webmcp`

#### D0.4: Express Server Skeleton (`packages/server/`)

```ts
// packages/server/src/app.ts
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import pino from 'pino';
import { healthRouter } from './routes/health.js';
import { agentRouter } from './routes/agent.js';
import { errorHandler } from './middleware/error-handler.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '500kb' }));  // Source code can be large

  // Rate limiting per token
  app.use('/api/agent', rateLimit({
    windowMs: 60_000,
    max: Number(process.env.RATE_LIMIT_RPM) || 30,
    keyGenerator: (req) => req.headers['x-github-token'] as string || req.ip,
    message: { error: 'Rate limit exceeded. Try again in a minute.' }
  }));

  app.use('/health', healthRouter);
  app.use('/api/agent', agentRouter);
  app.use(errorHandler);

  return app;
}
```

```ts
// packages/server/src/routes/agent.ts
import { Router } from 'express';
// import { verifyToken } from '../middleware/auth.js';

export const agentRouter = Router();

// POST /api/agent — Copilot Extension webhook
agentRouter.post('/', /* verifyToken, */ async (req, res) => {
  // Phase 0: Echo test response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const message = 'WebMCP Auto-Instrumentor is running. Instrumentation coming in Phase 1.';

  // SSE format per Copilot Extension spec
  res.write(`data: {"choices":[{"delta":{"content":"${message}"}}]}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});
```

#### D0.5: CI Pipeline (`.github/workflows/ci.yml`)

```yaml
name: CI
on: [push, pull_request]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - run: npm run lint
      - run: npm run test
```

### Phase 0 Acceptance Criteria

- [ ] `npm install` succeeds in monorepo root
- [ ] `npm run build` compiles all 4 packages
- [ ] `npm run test` passes (even if tests are trivial)
- [ ] `npm run lint` passes
- [ ] Server starts and `GET /health` returns 200
- [ ] `POST /api/agent` returns SSE echo response
- [ ] `@webmcp/runtime` builds to <2KB and creates `window.mcp`
- [ ] CI pipeline green on GitHub

---

## Phase 1 — React Parser + Classification + Proposal

**Duration:** Week 3-4  
**Goal:** Parse a React file → classify elements → produce a tool proposal. No code generation yet.

### Architecture

```
                   ┌─────────────────────┐
                   │   Input: .tsx file   │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │   React Parser      │
                   │   (ts-morph)        │
                   │                     │
                   │  1. Find components │
                   │  2. Extract JSX     │
                   │  3. Resolve state   │
                   │  4. Map handlers    │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │  ComponentAnalysis  │
                   │  (structured data)  │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │   Risk Classifier   │
                   │                     │
                   │  - Keyword scan     │
                   │  - Context rules    │
                   │  - Config overrides │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │  Proposal Builder   │
                   │                     │
                   │  Groups elements    │
                   │  into ToolProposal[]│
                   │  with risk + inputs │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │  Output: Proposal   │
                   │  (ready for user)   │
                   └─────────────────────┘
```

### Key Implementation Details

#### 1.1 React Parser — What It Actually Does

The parser must handle these **real-world React patterns**:

```tsx
// Pattern 1: Basic useState form (simple case)
const [email, setEmail] = useState('');
<input value={email} onChange={(e) => setEmail(e.target.value)} />

// Pattern 2: Single state object
const [form, setForm] = useState({ email: '', name: '' });
<input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} />

// Pattern 3: useRef (uncontrolled)
const emailRef = useRef<HTMLInputElement>(null);
<input ref={emailRef} />

// Pattern 4: React Hook Form
const { register, handleSubmit } = useForm();
<input {...register('email', { required: true })} />

// Pattern 5: MUI / Chakra / Third-party components
<TextField label="Email" value={email} onChange={handleChange} />

// Pattern 6: Form with onSubmit
<form onSubmit={handleSubmit}>
  ...
  <button type="submit">Send</button>
</form>

// Pattern 7: Standalone button (not in a form)
<button onClick={handleDelete}>Delete Item</button>
```

**Strategy:** Don't try to perfectly understand every pattern. Instead:

1. **Walk all JSX elements** in the component — collect every `<input>`, `<button>`, `<select>`, `<textarea>`, and known UI library components
2. **Walk all `useState`/`useRef` calls** — map them to elements via `value={...}` or `ref={...}` bindings
3. **Walk all functions** with `onSubmit`, `onClick`, `onChange` — link them to elements
4. **For unknown patterns** (RHF, Formik) — detect the import, switch to a specialized extractor or fall back to "send the whole component to the LLM and let it figure out the fields"

The **LLM is the fallback parser**. When AST analysis alone can't resolve the form structure (complex third-party library usage), we send the source to the LLM with the instruction "identify the form fields, their types, and the submit handler in this component."

```ts
// packages/engine/src/parser/react-parser.ts (key function signatures)

export function parseReactFile(source: string, fileName: string): ComponentAnalysis {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(fileName, source);

  const components = findComponents(sourceFile);         // Find exported function components
  const analysis: ComponentAnalysis = { fileName, framework: 'react', components: [] };

  for (const comp of components) {
    const info = analyzeComponent(comp, sourceFile);
    if (info.elements.length > 0 || info.eventHandlers.length > 0) {
      analysis.components.push(info);
    }
  }

  return analysis;
}

function findComponents(sourceFile: SourceFile): FunctionDeclaration[] {
  // Find: export default function X() {}
  //        export function X() {}
  //        const X = () => {}; export default X;
  //        export const X: React.FC = () => {}
  // ...
}

function analyzeComponent(comp: FunctionDeclaration, sourceFile: SourceFile): ComponentInfo {
  const elements = extractJSXElements(comp);             // All <input>, <button>, etc.
  const stateVars = extractStateVariables(comp);         // useState, useRef
  const handlers = extractEventHandlers(comp);            // onSubmit, onClick functions

  // Try to bind state variables to elements
  bindStateToElements(stateVars, elements);

  // Try to bind handlers to elements
  bindHandlersToElements(handlers, elements);

  return {
    name: comp.getName() || 'AnonymousComponent',
    type: classifyComponentType(elements, handlers),
    elements, eventHandlers: handlers, stateVariables: stateVars,
    props: extractProps(comp)
  };
}
```

#### 1.2 Grouping Elements into Tools

A single component can produce **multiple tools**. The grouping logic:

```ts
// A "tool" is one of:
// 1. A <form> element + all its children inputs → 1 tool (the submit action)
// 2. A standalone <button> with an onClick handler (not inside a form) → 1 tool
// 3. A group of related toggles/switches → 1 tool per toggle (or grouped if related)

function groupIntoToolCandidates(component: ComponentInfo): ToolCandidate[] {
  const candidates: ToolCandidate[] = [];

  // Group 1: Form-based tools
  const forms = component.elements.filter(el => el.tag === 'form' || hasFormParent(el));
  for (const form of findFormGroups(component.elements)) {
    candidates.push({
      type: 'form',
      triggerElement: form.submitButton,
      inputElements: form.inputs,
      handler: form.onSubmitHandler
    });
  }

  // Group 2: Standalone buttons
  const standaloneButtons = component.elements.filter(
    el => (el.tag === 'button' || el.inputType === 'button') && !isInsideForm(el)
  );
  for (const btn of standaloneButtons) {
    candidates.push({
      type: 'action',
      triggerElement: btn,
      inputElements: [],  // No inputs — action takes no parameters (or extracts from context)
      handler: findHandler(btn, component.eventHandlers)
    });
  }

  return candidates;
}
```

#### 1.3 Schema Generation via LLM (Stage 1 only)

At this phase, we send the `ComponentAnalysis` to the LLM and get back tool schemas. **No handler code yet** — just names, descriptions, and input schemas.

This is safe to do even before user selection because:
- Schema generation is cheap (small output, structured JSON)
- We need the schema fields (name, description, inputs) to show the proposal
- The proposal IS the schema summary

```ts
// packages/engine/src/llm/schema-generator.ts

export async function generateToolSchemas(
  analysis: ComponentAnalysis,
  candidates: ToolCandidate[],
  llm: LLMAdapter,
  sourceExcerpt: string
): Promise<ToolSchema[]> {
  const prompt = buildSchemaPrompt(analysis, candidates, sourceExcerpt);
  
  try {
    const schemas = await llm.generateJSON<ToolSchema[]>(prompt);
    // Validate each schema
    return schemas.filter(s => validateSchema(s).valid);
  } catch (e) {
    // Fallback: generate schemas from AST data alone (no LLM)
    return candidates.map(c => buildTemplateSchema(c));
  }
}
```

### Phase 1 Test Fixtures

Create these real React files under `test/fixtures/react/`:

```tsx
// test/fixtures/react/ContactForm.tsx — Basic controlled form
export default function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetch('/api/contact', { method: 'POST', body: JSON.stringify({ name, email, message }) });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      <label htmlFor="email">Email</label>
      <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label htmlFor="message">Message</label>
      <textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button type="submit">Send</button>
    </form>
  );
}
```

```tsx
// test/fixtures/react/SettingsPage.tsx — Mixed: safe + caution + destructive
export default function SettingsPage() {
  const [name, setName] = useState('');

  return (
    <div>
      <form onSubmit={handleUpdateProfile}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
        <button type="submit">Save Changes</button>
      </form>
      <button onClick={handleExportData}>Export My Data</button>
      <button onClick={handleDeleteAccount} className="danger">Delete Account</button>
    </div>
  );
}
```

```tsx
// test/fixtures/react/Dashboard.tsx — No instrumentable elements
export default function Dashboard() {
  return (
    <div>
      <h1>Welcome back</h1>
      <p>Your stats for today</p>
      <StatsChart data={chartData} />
    </div>
  );
}
```

```tsx
// test/fixtures/react/LoginForm.tsx — Form with password field
export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  return (
    <form onSubmit={handleLogin}>
      <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <input id="remember" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
      <label htmlFor="remember">Remember me</label>
      <button type="submit">Log In</button>
      <a href="/forgot-password">Forgot password?</a>
    </form>
  );
}
```

```tsx
// test/fixtures/react/SearchPage.tsx — Search with filter buttons
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  return (
    <div>
      <form onSubmit={handleSearch}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          aria-label="Search products"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All Categories</option>
          <option value="electronics">Electronics</option>
          <option value="clothing">Clothing</option>
        </select>
        <button type="submit">Search</button>
      </form>
      <button onClick={() => setSortBy('price')}>Sort by Price</button>
      <button onClick={() => setSortBy('rating')}>Sort by Rating</button>
    </div>
  );
}
```

### Phase 1 Acceptance Criteria

- [ ] `parseReactFile(contactForm)` returns `ComponentAnalysis` with 1 component, 3 inputs, 1 submit handler
- [ ] `parseReactFile(settingsPage)` returns 3 tool candidates (save, export, delete)
- [ ] `parseReactFile(dashboard)` returns 0 tool candidates
- [ ] Risk classifier tags "Delete Account" as `destructive`
- [ ] Risk classifier tags "Save Changes" as `caution`
- [ ] Risk classifier tags "Search" as `safe`
- [ ] Proposal builder produces `ToolProposal[]` with correct selections
- [ ] LLM schema generation returns valid JSON schemas for ContactForm
- [ ] Schema validator accepts valid schemas and rejects malformed ones
- [ ] Copilot Extension returns tool proposal via SSE when receiving a file

---

## Phase 2 — Interactive Selection + Code Gen + CLI

**Duration:** Week 5-6  
**Goal:** Full end-to-end flow — user selects tools, LLM generates handlers, code output is written.

### Architecture

```
Phase 1 output                    Phase 2 additions
(ToolProposal[])                   
       │                          
       ▼                          
┌──────────────┐     CLI path      ┌────────────────────┐
│ Tool Selector │───────────────────│ @inquirer/prompts  │
│              │                   │ checkbox picker     │
│              │     Copilot path   ├────────────────────┤
│              │───────────────────│ State cache +       │
│              │                   │ multi-turn SSE      │
└──────┬───────┘                   └────────────────────┘
       │ selected ToolProposal[]
       ▼
┌──────────────┐
│ LLM Stage 2  │─── Handler generation (only selected tools)
│ (per tool)   │
└──────┬───────┘
       │ ToolSchema + handler code
       ▼
┌──────────────┐     ┌──────────────┐
│ Syntax       │────►│ Code         │
│ Validator    │     │ Generator    │
│ (acorn)      │     │ (prettier)   │
└──────────────┘     └──────┬───────┘
                            │
                     ┌──────▼───────┐
                     │ .mcp.ts or   │
                     │ .mcp.js file │
                     └──────────────┘
```

### Key Implementation Details

#### 2.1 Copilot Extension State Management

Since Copilot Extensions are stateless webhooks, we need a way to remember the proposal between the first response (proposal) and the second request (selection).

```ts
// packages/server/src/state/proposal-cache.ts

interface CachedProposal {
  proposals: ToolProposal[];
  analysis: ComponentAnalysis;
  sourceCode: string;
  sourceHash: string;
  createdAt: number;
}

// Simple in-memory cache with TTL (5 minutes)
// For multi-instance deployment, replace with Redis
const cache = new Map<string, CachedProposal>();
const TTL = 5 * 60 * 1000; // 5 minutes

export function cacheProposal(userId: string, fileHash: string, data: CachedProposal): string {
  const key = `${userId}:${fileHash}`;
  cache.set(key, { ...data, createdAt: Date.now() });

  // Cleanup expired entries
  for (const [k, v] of cache) {
    if (Date.now() - v.createdAt > TTL) cache.delete(k);
  }

  return key;
}

export function getProposal(userId: string, fileHash: string): CachedProposal | undefined {
  const key = `${userId}:${fileHash}`;
  const cached = cache.get(key);
  if (!cached) return undefined;
  if (Date.now() - cached.createdAt > TTL) {
    cache.delete(key);
    return undefined;
  }
  return cached;
}
```

#### 2.2 Copilot Agent Multi-Turn Flow

The webhook handler must detect whether this is a "first request" (instrument command) or a "follow-up" (selection):

```ts
// packages/server/src/routes/agent.ts

agentRouter.post('/', verifyToken, async (req, res) => {
  const { prompt, context } = parseWebhookBody(req);
  const userId = extractUserId(req);

  // Detect intent
  if (isInstrumentCommand(prompt)) {
    // First turn: parse + classify + propose
    const sourceCode = extractSourceFromContext(context);
    const analysis = await parseFile(sourceCode, detectFileType(context));
    const proposals = await buildProposals(analysis, llmAdapter);

    // Cache for follow-up
    const hash = computeHash(sourceCode);
    cacheProposal(userId, hash, { proposals, analysis, sourceCode, sourceHash: hash });

    // Stream proposal back as SSE
    streamProposal(res, proposals);

  } else if (isSelectionResponse(prompt)) {
    // Second turn: user replied with "1, 2" or "all"
    const selection = parseSelection(prompt);   // [1, 2] or 'all'
    const cached = findCachedProposal(userId);  // Find the most recent proposal

    if (!cached) {
      streamError(res, 'No active proposal found. Please run @webmcp instrument first.');
      return;
    }

    const selectedTools = applySelection(cached.proposals, selection);
    const generatedCode = await generateCode(selectedTools, cached, llmAdapter);
    streamCode(res, generatedCode);
  }
});
```

#### 2.3 Handler Generation — React-Specific

The LLM generates handler code, but we enforce the correct DOM interaction pattern per framework:

```ts
// packages/engine/src/generator/framework-helpers.ts

export const REACT_SET_VALUE_HELPER = `
function __mcpSetValue(selector, value) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found: ' + selector);
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __mcpSetChecked(selector, checked) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found: ' + selector);
  el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __mcpSetSelect(selector, value) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found: ' + selector);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __mcpClick(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error('Element not found: ' + selector);
  el.click();
}
`;
```

These helpers are **injected once** at the top of every generated `.mcp.js`/`.mcp.ts` file. Handler code uses them instead of raw DOM manipulation — guaranteeing correctness across frameworks.

#### 2.4 CLI Implementation

```ts
// packages/cli/src/commands/instrument.ts

import { checkbox } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';
import { parseFile } from '@webmcp/engine/parser';
import { classifyAndPropose } from '@webmcp/engine/proposal';
import { generateCode } from '@webmcp/engine/generator';
import { detectLLMBackend } from '@webmcp/engine/llm';

export async function instrumentCommand(filePath: string, options: InstrumentOptions) {
  // 1. Detect LLM
  const llm = await detectLLMBackend(options.llm);
  console.log(chalk.blue(`ℹ Using ${llm.name}`));

  // 2. Parse
  const spinner = ora('Parsing...').start();
  const source = fs.readFileSync(filePath, 'utf-8');
  const analysis = parseFile(source, filePath);
  spinner.succeed(`Parsed ${path.basename(filePath)}`);

  if (analysis.components.every(c => c.elements.length === 0)) {
    console.log(chalk.yellow('\n⚠ No instrumentable elements found.'));
    console.log('  This file has no forms, buttons, or interactive elements.\n');
    return;
  }

  // 3. Classify + Propose
  const proposals = await classifyAndPropose(analysis, llm, source);
  console.log(chalk.green(`✔ Found ${proposals.length} potential tools\n`));

  // 4. Select
  let selected: ToolProposal[];

  if (options.dryRun) {
    printProposalTable(proposals);
    return;
  } else if (options.yes) {
    selected = proposals.filter(p => p.risk !== 'destructive' && p.risk !== 'excluded');
  } else if (options.all) {
    selected = proposals.filter(p => p.risk !== 'excluded');
  } else if (options.select) {
    const indices = options.select.split(',').map(Number);
    selected = proposals.filter((_, i) => indices.includes(i + 1));
  } else {
    // Interactive
    const choices = proposals
      .filter(p => p.risk !== 'excluded')
      .map((p, i) => ({
        name: formatProposalLine(p),
        value: i,
        checked: p.selected // safe = checked, destructive = unchecked
      }));

    const selectedIndices = await checkbox({
      message: 'Select tools to generate:',
      choices
    });

    selected = selectedIndices.map(i => proposals[i]);
  }

  if (selected.length === 0) {
    console.log(chalk.yellow('No tools selected. Nothing generated.'));
    return;
  }

  // 5. Generate
  const genSpinner = ora(`Generating ${selected.length} tools...`).start();
  const output = await generateCode(selected, analysis, llm, source, {
    format: options.output?.endsWith('.ts') ? 'esm' : 'auto',
    framework: analysis.framework
  });
  genSpinner.succeed(`Generated ${selected.length} tools`);

  // 6. Write
  const outputPath = options.output || deriveOutputPath(filePath, analysis.framework);
  fs.writeFileSync(outputPath, output.code, 'utf-8');
  console.log(chalk.green(`\n📄 Output written to: ${outputPath}\n`));

  // 7. Show wiring instructions
  printWiringInstructions(outputPath, analysis.framework);
}
```

#### 2.5 LLM Auto-Detection

```ts
// packages/engine/src/llm/detect.ts

export async function detectLLMBackend(explicit?: string): Promise<LLMAdapter> {
  if (explicit) return createAdapter(explicit);

  // Priority: OpenAI → GitHub Models → Ollama → None
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIAdapter(process.env.OPENAI_API_KEY);
  }

  const ghToken = process.env.GITHUB_TOKEN || await getGhAuthToken();
  if (ghToken && await hasModelsScope(ghToken)) {
    return new GitHubModelsAdapter(ghToken);
  }

  if (await isOllamaRunning()) {
    return new OllamaAdapter(process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
  }

  console.log(chalk.yellow('⚠ No LLM backend available. Using template-only mode.'));
  console.log('  For better results, set OPENAI_API_KEY or run `gh auth login`.\n');
  return new NoneAdapter();
}

async function getGhAuthToken(): Promise<string | null> {
  try {
    const { stdout } = await exec('gh auth token');
    return stdout.trim();
  } catch {
    return null;
  }
}

async function hasModelsScope(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://models.inference.ai.azure.com/models', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}
```

### Phase 2 Acceptance Criteria

- [ ] CLI `instrument` command works end-to-end with interactive selection
- [ ] `--yes`, `--all`, `--dry-run`, `--select` flags work correctly
- [ ] LLM adapter auto-detection picks the correct backend
- [ ] Generated `.mcp.ts` file contains valid syntax (passes acorn parse)
- [ ] Generated handlers use `__mcpSetValue` helper (not raw `.value =`)
- [ ] Generated selectors use ID > data-testid > name > aria-label fallback chain
- [ ] Copilot Extension two-turn flow works (proposal → selection → code)
- [ ] `/api/agent` proposal caching works with TTL expiry
- [ ] SSE streaming works for both proposal and generated code
- [ ] Generated code imports `@webmcp/runtime` or includes guard for `window.mcp`
- [ ] Output file includes source hash header comment

---

## Phase 3 — HTML Support + Polish + Ship

**Duration:** Week 7-8  
**Goal:** HTML parsing, all LLM backends, error hardening, config system, test coverage, ship-ready.

### Additional Deliverables

#### 3.1 HTML Parser

```ts
// packages/engine/src/parser/html-parser.ts
import { Parser } from 'htmlparser2';

export function parseHTMLFile(source: string, fileName: string): ComponentAnalysis {
  const elements: UIElement[] = [];
  const forms: Map<number, UIElement[]> = new Map();
  let currentFormIndex = -1;

  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === 'form') {
        currentFormIndex++;
        forms.set(currentFormIndex, []);
      }
      if (['input', 'textarea', 'select', 'button'].includes(name)) {
        const el = mapToUIElement(name, attrs);
        elements.push(el);
        if (currentFormIndex >= 0) {
          forms.get(currentFormIndex)!.push(el);
        }
      }
    },
    onclosetag(name) {
      if (name === 'form') currentFormIndex = -1;
    }
  });

  parser.write(source);
  parser.end();

  return {
    fileName,
    framework: 'html',
    components: [{
      name: path.basename(fileName, path.extname(fileName)),
      type: forms.size > 0 ? 'form' : 'display',
      elements,
      eventHandlers: extractInlineHandlers(source),
      stateVariables: [],
      props: []
    }]
  };
}
```

#### 3.2 NoneAdapter (Template-Only Fallback)

```ts
// packages/engine/src/llm/none-adapter.ts

export class NoneAdapter implements LLMAdapter {
  name = 'Template-only (no LLM)';

  async generate(): Promise<string> {
    throw new Error('NoneAdapter does not support freeform generation');
  }

  async generateJSON<T>(messages: LLMMessage[]): Promise<T> {
    // Parse the user message to find ComponentAnalysis
    // Generate schemas using templates — no descriptions, just structure
    throw new Error('NoneAdapter: use buildTemplateSchema() instead');
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }
}

// Template-based schema generation (no LLM needed)
export function buildTemplateSchema(candidate: ToolCandidate): ToolSchema {
  const inputs = candidate.inputElements.map(el => ({
    name: el.name || el.id || el.tag,
    type: mapInputTypeToJSONType(el.inputType || 'text'),
    description: el.label || el.accessibilityHints?.ariaLabel || `${el.tag} field`,
    required: el.validation?.includes('required') || false
  }));

  return {
    name: generateToolName(candidate),          // "submit_" + formName
    description: `Interacts with ${candidate.type} in ${candidate.triggerElement.tag}`,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(inputs.map(i => [i.name, { type: i.type, description: i.description }])),
      required: inputs.filter(i => i.required).map(i => i.name)
    }
  };
}
```

#### 3.3 Config Loader

```ts
// packages/engine/src/config/loader.ts
import { cosmiconfig } from 'cosmiconfig';

const explorer = cosmiconfig('webmcp', {
  searchPlaces: [
    '.webmcprc.json',
    '.webmcprc.yml',
    '.webmcprc.yaml',
    'webmcp.config.js',
    'webmcp.config.ts',
    'package.json'  // "webmcp" key
  ]
});

export async function loadConfig(searchFrom?: string): Promise<WebMCPConfig> {
  const result = await explorer.search(searchFrom);
  if (!result || result.isEmpty) return getDefaultConfig();
  return mergeWithDefaults(result.config);
}
```

#### 3.4 Error Handling Taxonomy

Every error the user can hit, with clear messaging:

```ts
// packages/engine/src/errors.ts

export class WebMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage: string,
    public suggestion?: string
  ) {
    super(message);
  }
}

export const ERRORS = {
  FILE_NOT_FOUND: (path: string) => new WebMCPError(
    `File not found: ${path}`,
    'FILE_NOT_FOUND',
    `Could not find file: ${path}`,
    'Check the path and try again.'
  ),
  UNSUPPORTED_FILE_TYPE: (ext: string) => new WebMCPError(
    `Unsupported file type: ${ext}`,
    'UNSUPPORTED_TYPE',
    `File type "${ext}" is not supported.`,
    'Supported types: .tsx, .jsx, .html. Vue support coming in v2.'
  ),
  NO_ELEMENTS_FOUND: (file: string) => new WebMCPError(
    `No instrumentable elements in ${file}`,
    'NO_ELEMENTS',
    `No forms, buttons, or interactive elements found in ${file}.`,
    'Try pointing at a specific page or form component.'
  ),
  LLM_UNAVAILABLE: () => new WebMCPError(
    'No LLM backend available',
    'LLM_UNAVAILABLE',
    'No LLM backend detected.',
    'Set OPENAI_API_KEY, run `gh auth login`, or start Ollama.'
  ),
  SCHEMA_VALIDATION_FAILED: (errors: string[]) => new WebMCPError(
    `Schema validation failed: ${errors.join(', ')}`,
    'SCHEMA_INVALID',
    'Generated schema did not pass validation.',
    'This is usually a transient LLM error. Try again.'
  ),
  PROPOSAL_EXPIRED: () => new WebMCPError(
    'Cached proposal expired',
    'PROPOSAL_EXPIRED',
    'Your tool proposal has expired (5 min timeout).',
    'Run @webmcp instrument again to get a fresh proposal.'
  )
};
```

### Phase 3 Acceptance Criteria

- [ ] HTML files parse correctly (single form, multi-form, no-form)
- [ ] `--llm openai` works with OPENAI_API_KEY
- [ ] `--llm ollama` works with local Ollama
- [ ] `--llm none` produces valid (if basic) schemas without any LLM call
- [ ] `.webmcprc.json` is loaded and classification overrides take effect
- [ ] All error cases produce clear, actionable messages
- [ ] Test coverage ≥80%
- [ ] Snapshot tests pass for all fixtures
- [ ] `cosmiconfig` loads config from all supported locations

---

## Missing Scenarios Analysis

### What common user scenarios are we covering?

| # | Scenario | Covered? | Notes |
|---|----------|----------|-------|
| 1 | Simple React form (useState) | ✅ Yes | Core flow |
| 2 | React form with React Hook Form | ✅ Yes (Phase 1) | Custom extractor for `useForm`/`register` |
| 3 | React form with Formik | ✅ Yes (Phase 1) | Custom extractor for `useFormik` |
| 4 | MUI/Chakra/Ant Design components | ✅ Yes (Phase 1) | Component map resolves `<TextField>` → `<input>` |
| 5 | Static HTML page with forms | ✅ Yes (Phase 3) | HTML parser |
| 6 | Page with search bar | ✅ Yes | Classified as safe, included by default |
| 7 | Settings page with destructive actions | ✅ Yes | Delete excluded, edit/save included |
| 8 | Next.js page | ⚠️ Partial | Client components work. Server Components detected + skipped with message |
| 9 | Login form (password field) | ✅ Yes | Password typed as `string` in schema, `inputType: "password"` preserved |
| 10 | Form with file upload | ✅ Yes | File inputs excluded (classified as `excluded`) |
| 11 | Page with only navigation links | ✅ Yes | All links excluded, "no instrumentable elements" message |
| 12 | Component with no exports | ⚠️ Partial | Parser looks for exports — internal components skipped. Fine for most cases. |
| 13 | TypeScript strict project | ✅ Yes | Default output is `.mcp.js` (not `.mcp.ts`) to avoid strict TS issues. User can opt into `.mcp.ts` via config. |
| 14 | User re-runs after code change | ✅ Yes | Idempotency via source hash |
| 15 | User has no LLM available | ✅ Yes | `--llm none` template fallback |
| 16 | User wants to customize tool names | ✅ Yes (v2) | Config file with naming conventions |
| 17 | CI/CD pipeline integration | ✅ Yes | `--yes` flag + exit codes |
| 18 | Monorepo with many pages | ⚠️ v2 | Batch mode with `--recursive` planned |
| 19 | User edits generated file, then re-runs | ✅ Yes | Detects manual edits, prompts before overwrite |
| 20 | Vue SFC | ⚠️ v2 | Planned for post-launch |

### Key Decision: Default Output Extension

Generate `.mcp.js` by default (not `.mcp.ts`):
- Works in any project without TS config issues
- Use JSDoc `/** @type {import('@webmcp/runtime').MCPTool} */` for type hints
- Users can switch to `.mcp.ts` via config: `{ "output": { "fileExtension": ".mcp.ts" } }`

---

## Monorepo Package Dependency Graph

```
@webmcp/runtime    (standalone — no deps, browser-side)
       ↑ (users install this in their app)
       │
@webmcp/engine     (core — parser, classifier, generator, LLM adapters)
       ↑
       ├──────────────────┐
       │                  │
   webmcp (CLI)    @webmcp/server (Copilot Extension)
   npm: webmcp     (deployed to Vercel/Render)
```

**Important:** `@webmcp/engine` is a dependency of both CLI and server, but `@webmcp/runtime` is independent — users install it in their own app, not in our tool.

---

## Summary: What to Build First

```
Week 1:  Monorepo setup, tsconfigs, CI, turbo
Week 2:  @webmcp/runtime, Express server skeleton, type definitions
Week 3:  React parser (basic useState forms), risk classifier
Week 4:  Proposal builder, LLM schema generation (Stage 1), Copilot proposal response
Week 5:  CLI instrument command, interactive selection, LLM handler gen (Stage 2)
Week 6:  Code generator, selector helpers, Copilot multi-turn, LLM auto-detection
Week 7:  HTML parser, all LLM adapters, config loader
Week 8:  Error hardening, test coverage push, snapshot tests
Week 9:  README, demo GIF, npm publish, Copilot Extension marketplace
```

Ready to start scaffolding Phase 0.
