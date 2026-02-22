# WebMCP Auto-Instrumentor — Technical Plan

> Detailed implementation blueprint expanding on [Inital.md](Inital.md).

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [How WebMCP Works (Primer)](#2-how-webmcp-works-primer)
3. [Product Scope & Boundaries](#3-product-scope--boundaries)
4. [Architecture Overview](#4-architecture-overview)
5. [Detailed Component Design](#5-detailed-component-design)
6. [Authentication & LLM Access](#6-authentication--llm-access)
7. [Execution Workflow (Deep Dive)](#7-execution-workflow-deep-dive)
8. [Tool Risk Classification](#8-tool-risk-classification)
9. [Propose → Review → Confirm Workflow](#9-propose--review--confirm-workflow)
10. [User Scenario (End-to-End)](#10-user-scenario-end-to-end)
11. [Prompt Engineering Strategy](#11-prompt-engineering-strategy)
12. [Project Structure](#12-project-structure)
13. [Phased Delivery Roadmap](#13-phased-delivery-roadmap)
14. [Risk Mitigation](#14-risk-mitigation)
15. [Developer Experience (DX) Design](#15-developer-experience-dx-design)
16. [Testing Strategy](#16-testing-strategy)
17. [Go-to-Market Execution](#17-go-to-market-execution)
18. [Idempotency & Update Lifecycle](#18-idempotency--update-lifecycle)
19. [Deployment & Infrastructure](#19-deployment--infrastructure)
20. [Accessibility-Driven Enrichment](#20-accessibility-driven-enrichment)

---

## 1. Problem Statement

The Web Model Context Protocol (WebMCP) enables AI agents to discover and invoke tools exposed by web pages — but **adopting it requires manual, repetitive work:**

| Task | Manual Effort |
|------|--------------|
| Identify instrumentable UI elements | Reading every component file |
| Write JSON Tool Schemas | 15-30 min per tool |
| Write `window.mcp.registerTool()` bindings | 10-20 min per tool |
| Keep schemas in sync with UI changes | Ongoing maintenance burden |

**WebMCP Auto-Instrumentor eliminates this entirely.** A developer points it at their code and gets production-ready schemas + bindings in seconds.

---

## 2. How WebMCP Works (Primer)

```
┌──────────────┐     discovers tools      ┌──────────────────┐
│   AI Agent   │  ◄──────────────────────  │   Web Page with  │
│  (Browser)   │                           │   WebMCP Tools   │
│              │  ──── invokes tool ─────► │                  │
└──────────────┘                           └──────────────────┘
```

A WebMCP-compatible page exposes tools via:

```js
// 1. Register a tool on the page
window.mcp.registerTool({
  name: "submit_contact_form",
  description: "Submits the contact form with the provided details",
  inputSchema: {
    type: "object",
    properties: {
      name:    { type: "string", description: "Full name" },
      email:   { type: "string", description: "Email address" },
      message: { type: "string", description: "Message body" }
    },
    required: ["name", "email", "message"]
  },
  handler: async (params) => {
    // For React apps, we must use the native setter + dispatch an
    // input event so React's synthetic event system picks up the change.
    function setNativeValue(el, value) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setNativeValue(document.querySelector('#name'), params.name);
    setNativeValue(document.querySelector('#email'), params.email);
    setNativeValue(document.querySelector('#message'), params.message);
    document.querySelector('#contact-form button[type="submit"]').click();
    return { success: true };
  }
});
```

> **Important:** Plain `.value =` assignment does **not** trigger React state updates. Generated handlers must use the native property descriptor setter + dispatch a synthetic `input` event. Our code generator handles this automatically per framework.

**Our tool generates exactly this** — automatically, from existing source code.

---

## 3. Product Scope & Boundaries

### In Scope (v1)

| Capability | Detail |
|-----------|--------|
| **React support** | Functional components, JSX/TSX, hooks-based forms |
| **HTML support** | Static HTML files with `<form>`, `<button>`, `<input>` elements |
| **Schema generation** | JSON Schema output conforming to WebMCP tool spec |
| **Binding generation** | `window.mcp.registerTool()` JavaScript code |
| **Copilot Extension** | Chat-based triggering via `@webmcp` |
| **CLI** | `npx webmcp instrument ./src/ContactForm.tsx` |
| **Dry-run mode** | Preview changes without writing files |
| **Tool risk classification** | Auto-classify elements as safe / caution / destructive / excluded |
| **Interactive tool selection** | Propose tools → user picks which to generate |
| **Config file (basic)** | `.webmcprc.json` for include/exclude rules |

### In Scope (v2 — Post-Launch)

| Capability | Detail |
|-----------|--------|
| **Vue support** | `.vue` SFCs with `<template>` + `<script setup>` |
| **Multi-file analysis** | Cross-component prop tracing |
| **Batch mode** | Instrument an entire `src/` directory |
| **Watch mode** | Re-instrument on file save |
| **Advanced config** | Custom naming conventions, per-route rules, tool grouping |

### Out of Scope

- Backend/API instrumentation (server-side MCP is a different tool)
- Runtime agent behavior (we generate code; we don't run agents)
- Non-JavaScript frameworks (Svelte, Angular — future consideration)

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Developer's Environment                     │
│                                                                   │
│  ┌──────────────┐    ┌──────────────────┐    ┌────────────────┐  │
│  │  VS Code +   │    │   CLI            │    │  CI Pipeline   │  │
│  │  Copilot Chat │    │  `npx webmcp`   │    │  (future)      │  │
│  └──────┬───────┘    └────────┬─────────┘    └───────┬────────┘  │
│         │                     │                       │           │
└─────────┼─────────────────────┼───────────────────────┼───────────┘
          │                     │                       │
          ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     WebMCP Server / Engine                        │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │  Request     │  │  AST Parser  │  │  Risk Classifier     │    │
│  │  Handler     │──│  & Analyzer  │──│  (keyword + context)  │    │
│  │  (Express)   │  │  (ts-morph)  │  │                      │    │
│  └─────────────┘  └──────────────┘  └──────────┬───────────┘    │
│                                                  │                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────▼───────────┐    │
│  │  Tool        │  │  LLM Prompt  │  │  Proposal Builder    │    │
│  │  Selector    │◄─│  Engine      │◄─│  (summary for user)  │    │
│  │  (user I/O)  │  │              │  │                      │    │
│  └──────┬──────┘  └──────────────┘  └──────────────────────┘    │
│         │                                                        │
│  ┌──────▼──────┐  ┌──────────────┐                              │
│  │  Schema      │  │  Code        │                              │
│  │  Validator   │  │  Generator   │                              │
│  └─────────────┘  └──────────────┘                              │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Role | Key Libraries |
|-----------|------|---------------|
| **Request Handler** | Accepts webhook/CLI input, authenticates, routes | Express.js, `@github/copilot-extensions-preview-sdk` |
| **AST Parser & Analyzer** | Extracts component tree, form elements, event handlers, props | `ts-morph`, `htmlparser2` |
| **Risk Classifier** | Tags each element as safe/caution/destructive/excluded based on keywords + context | Built-in rule engine |
| **Proposal Builder** | Creates a human-readable summary of discovered tools for review | Custom |
| **Tool Selector** | Handles user confirmation — interactive prompt (CLI) or conversational (Copilot) | `@inquirer/prompts` (CLI) |
| **LLM Prompt Engine** | Builds structured prompts, sends to LLM API, parses response | Copilot SDK / OpenAI SDK / Ollama, custom prompt templates |
| **Schema Validator** | Validates generated JSON against WebMCP spec | `ajv` (JSON Schema validator) |
| **Code Generator** | Produces final `.mcp.js` / `.mcp.ts` files or inline code blocks | `prettier` for formatting |

---

## 5. Detailed Component Design

### 5.1 AST Parser & Analyzer

This is the **most critical component** — it determines the quality of everything downstream.

**Input:** Raw source code (string) + file type hint (`.tsx`, `.jsx`, `.html`)

**Output:** A structured `ComponentAnalysis` object:

```ts
interface ComponentAnalysis {
  fileName: string;
  framework: "react" | "vue" | "html";
  components: ComponentInfo[];
}

interface ComponentInfo {
  name: string;                    // e.g., "ContactForm"
  type: "form" | "action" | "display" | "navigation";
  elements: UIElement[];
  eventHandlers: EventHandler[];
  stateVariables: StateVariable[];
  props: PropDefinition[];
}

interface UIElement {
  tag: string;                     // "input", "button", "select", "textarea"
  inputType?: string;              // "text", "email", "checkbox", "radio", "file", etc.
  attributes: Record<string, string>; // { type: "email", placeholder: "..." }
  label?: string;                  // Resolved from <label>, aria-label, aria-describedby, or placeholder
  name?: string;                   // Form field name
  id?: string;
  validation?: string[];           // ["required", "pattern:^[a-z]+$"]
  accessibilityHints?: {           // Used to enrich tool descriptions
    ariaLabel?: string;
    ariaDescribedBy?: string;
    role?: string;
    title?: string;
  };
}

// Risk classification assigned by the classifier, shown to user during proposal
type ToolRisk = "safe" | "caution" | "destructive" | "excluded";

interface ToolProposal {
  toolName: string;                // e.g., "submit_contact_form"
  description: string;             // One-line summary for the user
  risk: ToolRisk;
  riskReason?: string;             // Why it was flagged (e.g., "Button text contains 'delete'")
  elements: UIElement[];           // Which UI elements map to this tool
  inputFields: { name: string; type: string; required: boolean }[];
  selected: boolean;               // Default selection based on risk level
}

interface EventHandler {
  event: string;                   // "onSubmit", "onClick"
  handlerName: string;             // "handleSubmit"
  handlerBody?: string;            // Extracted function body (truncated)
  associatedElement?: string;      // Which element triggers this
}

interface StateVariable {
  name: string;                    // "email"
  setter?: string;                 // "setEmail"
  initialValue?: string;
  boundToElement?: string;         // Which input this maps to
}

interface PropDefinition {
  name: string;
  type?: string;
  required: boolean;
}
```

**Parsing Strategy by Framework:**

| Framework | Parser | Extraction Logic |
|-----------|--------|-----------------|
| React (TSX/JSX) | `ts-morph` | Walk JSX elements, resolve `useState` bindings, extract `onSubmit`/`onClick` handlers |
| HTML | `htmlparser2` | Walk DOM tree, extract `<form>` structures, `<button>` elements, inline event handlers |
| Vue 3 (v2 scope) | `@vue/compiler-sfc` | Parse `<template>` for `v-model` bindings, `<script setup>` for Composition API refs/reactivity |

### 5.2 LLM Prompt Engine

The engine follows a **two-stage prompting** approach:

**Stage 1 — Schema Generation (Structured Output)**

```
SYSTEM: You are a WebMCP schema generator. Given a structured analysis of a 
UI component, produce a JSON array of WebMCP tool definitions.

Rules:
- Each interactive group (form, action button, navigation) = 1 tool
- Tool names: snake_case, verb_noun format (e.g., "submit_contact_form")
- Descriptions: One sentence explaining what an AI agent can accomplish
- Input schemas: Derive property types from input types, validation rules, 
  and state variable types
- Mark fields as required based on HTML required attribute or validation logic

USER: <ComponentAnalysis JSON>

RESPONSE FORMAT: JSON array of WebMCP tool schemas
```

**Stage 2 — Handler Code Generation**

```
SYSTEM: You are a JavaScript code generator. Given a WebMCP tool schema and 
the original component source code, produce the `handler` function body.

Rules:
- Use DOM selectors that match the original code (prefer IDs > data-testid > names > classes)
- For React apps, use the native property descriptor setter pattern:
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val)`
  then dispatch `new Event('input', { bubbles: true })` — plain `.value =` does NOT work
- For checkboxes/radios, set `.checked` and dispatch a `change` event
- For `<select>`, set `.value` and dispatch `change`
- Always return a result object: { success: boolean, message?: string, data?: any }
- Handle errors gracefully with try/catch
- Do NOT import external libraries
- Leverage aria-label / aria-describedby from the source to write better descriptions

USER: { schema: <tool_schema>, sourceCode: <original_source> }

RESPONSE FORMAT: JavaScript function body (string)
```

**Why two stages?**
- Stage 1 is deterministic-friendly (structured JSON output) — higher reliability
- Stage 2 needs the schema context + original code — benefits from a focused prompt
- Separating them allows independent validation and retry
- Stage 2 only runs for **user-approved tools** — saves LLM calls for excluded tools

### 5.3 Schema Validator

Uses `ajv` to validate every generated schema against the WebMCP tool definition spec:

```ts
// Schema validation covers the JSON schema portion only.
// The handler is a function — it is validated separately via syntax parsing.
const WEBMCP_TOOL_SCHEMA = {
  type: "object",
  required: ["name", "description", "inputSchema"],
  properties: {
    name: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
    description: { type: "string", minLength: 10 },
    inputSchema: { "$ref": "http://json-schema.org/draft-07/schema#" }
  }
};

// Handler validation: parse the generated function body with acorn
// to verify syntax WITHOUT executing it. Never use new Function() or eval().
import { parse } from 'acorn';
function validateHandlerSyntax(code: string): { valid: boolean; error?: string } {
  try {
    parse(`(async function handler(params) { ${code} })`, {
      ecmaVersion: 'latest', sourceType: 'module'
    });
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}
```

If validation fails → retry LLM generation (up to 2 retries) with the validation error appended to the prompt.

### 5.4 Code Generator

Produces the final output in one of two formats:

**Format A: Standalone `.mcp.js` file (default for CLI + HTML projects)**

```js
// Auto-generated by WebMCP Auto-Instrumentor
// Source: ./src/contact.html
// Generated: 2026-02-22T10:30:00Z
// Source hash: a3f8c1d (re-run only if source changed)

(function() {
  if (!window.mcp) {
    console.warn('WebMCP runtime not detected. Skipping tool registration.');
    return;
  }

  window.mcp.registerTool({ /* ... */ });
})();
```

**Format B: ES Module `.mcp.ts` file (default for React/Vue projects)**

React/Vue apps are bundled — a plain `<script>` tag doesn't fit their workflow. Instead, generate an importable module:

```ts
// Auto-generated by WebMCP Auto-Instrumentor
// Source: ./src/ContactForm.tsx
// Generated: 2026-02-22T10:30:00Z

export function registerContactFormTools() {
  if (!window.mcp) {
    console.warn('WebMCP runtime not detected. Skipping tool registration.');
    return;
  }

  window.mcp.registerTool({ /* ... */ });
}

// Usage: import and call in your app entry point or component mount:
// import { registerContactFormTools } from './ContactForm.mcp';
// registerContactFormTools();
```

**Format C: Inline code block (default for Copilot Extension)**

Returns the code as a Markdown fenced block in the chat response, ready for the developer to copy or apply.

---

## 6. Authentication & LLM Access

The Copilot Extension and the CLI have **fundamentally different auth models.** This section clarifies exactly how each surface reaches an LLM.

### 6.1 Copilot Extension (Server-Side) — Zero Config

GitHub handles everything. When a user types `@webmcp` in Copilot Chat:

1. GitHub sends a POST webhook to our server with an `X-GitHub-Token` header
2. This token is a **short-lived, scoped token** issued by GitHub — not a PAT
3. Our server uses this token to call the Copilot LLM API via the SDK
4. **The user does nothing** — auth is invisible

```
User → Copilot Chat → GitHub (injects token) → Our Server → Copilot LLM API
```

> **Important:** This token **cannot** be obtained by the CLI. It only exists within the Copilot Extension webhook flow. The original plan incorrectly assumed `gh auth token` could access the Copilot LLM API — it cannot.

### 6.2 CLI — Hybrid Auto-Detection

The CLI has no access to Copilot Extension tokens. Instead, it auto-detects the best available LLM backend:

```
CLI startup:
  1. Was --llm flag explicitly set?           → Use that backend
  2. Is OPENAI_API_KEY env var present?        → Use OpenAI
  3. Is GITHUB_TOKEN present or `gh auth       → Use GitHub Models API
     token` available with models:read scope?     (models.inference.ai.azure.com)
  4. Is Ollama running locally (:11434)?       → Use Ollama
  5. None available?                           → Fall back to --llm none
                                                 (template-only, no descriptions)
```

### 6.3 CLI LLM Backend Options

| Flag | Auth Source | API Endpoint | Cost |
|------|-------------|-------------|------|
| `--llm github-models` | `GITHUB_TOKEN` env var or `gh auth token` (needs `models:read` scope) | `https://models.inference.ai.azure.com/` | Free for Copilot subscribers |
| `--llm openai` | `OPENAI_API_KEY` env var | `https://api.openai.com/v1/` | Pay-per-token |
| `--llm ollama` | None (local) | `http://localhost:11434` (or `OLLAMA_BASE_URL`) | Free (local compute) |
| `--llm none` | None | N/A — template-based generation only | Free |
| *(auto)* | Auto-detect in priority order above | Varies | Varies |

### 6.4 Auth Failure UX

```
$ npx webmcp instrument ./src/ContactForm.tsx

  ⚠ No LLM backend available.

  To get the best results, configure one of these:

  Option 1 — GitHub Models (free with Copilot subscription):
    $ gh auth login
    $ gh auth refresh --scopes models:read

  Option 2 — OpenAI:
    $ export OPENAI_API_KEY=sk-...

  Option 3 — Ollama (local, free):
    $ ollama serve

  Proceeding with --llm none (template-only, limited descriptions)...
```

### 6.5 GitHub Models Adapter

GitHub Models exposes GPT-4o, Claude, and other models via a standard REST API authenticated with a GitHub PAT. This is **different from the Copilot LLM API** used by extensions.

```ts
// src/engine/llm/github-models-adapter.ts
const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${githubToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    response_format: { type: 'json_object' }
  })
});
```

---

## 7. Execution Workflow (Deep Dive)

The execution workflow now follows a **parse → classify → propose → select → generate** pipeline.

### 7.1 Copilot Extension Flow (Conversational)

```
Developer                VS Code / Copilot           WebMCP Server
   │                          │                           │
   │  "@webmcp instrument     │                           │
   │   this file"             │                           │
   │─────────────────────────►│                           │
   │                          │  POST /api/agent          │
   │                          │  { prompt, context,       │
   │                          │    X-GitHub-Token }       │
   │                          │──────────────────────────►│
   │                          │                           │ 1. Parse AST
   │                          │                           │ 2. Classify risks
   │                          │                           │ 3. Build proposal
   │                          │    SSE: Tool proposal     │
   │                          │◄──────────────────────────│
   │  "I found 3 tools...     │                           │
   │   which to include?"     │                           │
   │◄─────────────────────────│                           │
   │                          │                           │
   │  "1, 2"                  │                           │
   │─────────────────────────►│                           │
   │                          │  POST /api/agent          │
   │                          │  { selection: [1,2] }     │
   │                          │──────────────────────────►│
   │                          │                           │ 4. LLM gen (selected)
   │                          │                           │ 5. Validate schemas
   │                          │    SSE: Generated code    │
   │                          │◄──────────────────────────│
   │  Code block output       │                           │
   │◄─────────────────────────│                           │
```

### 7.2 CLI Flow (Interactive)

```bash
# Interactive (default) — shows proposal, user selects
npx webmcp instrument ./src/ContactForm.tsx

# Accept all safe tools without prompting
npx webmcp instrument ./src/ContactForm.tsx --yes

# Accept ALL tools including destructive ones
npx webmcp instrument ./src/ContactForm.tsx --all

# Dry run — show proposal only, generate nothing
npx webmcp instrument ./src/ContactForm.tsx --dry-run

# Output to specific file
npx webmcp instrument ./src/ContactForm.tsx -o ./public/mcp-tools.js

# Batch mode (v2)
npx webmcp instrument ./src/ --recursive
```

---

## 8. Tool Risk Classification

Not every interactive element should become a WebMCP tool. The classifier automatically categorizes each candidate and sets sensible defaults.

### 8.1 Classification Rules

| Element Pattern | Risk Level | Default Selection | Rationale |
|----------------|-----------|-------------------|----------|
| `<form>` with submit handler | **safe** | ✅ Included | Core use case — data entry tools |
| Read-only action button (search, filter, sort) | **safe** | ✅ Included | Non-destructive, high value |
| Toggle / switch (theme, sidebar) | **safe** | ✅ Included | Low-risk UI state change |
| Buttons with text: "edit", "update", "save" | **caution** | ✅ Included (with warning) | Modifies data but not destructive |
| Buttons with text: "delete", "remove", "cancel", "destroy", "revoke" | **destructive** | ❌ Excluded (flagged ⚠️) | Could cause data loss |
| Navigation links / router pushes | **excluded** | ❌ Excluded | Agents handle navigation natively |
| File upload inputs (`<input type="file">`) | **excluded** | ❌ Excluded | Agents can't easily provide file blobs |
| Inputs with no form parent / no handler | **excluded** | ❌ Excluded | Orphaned — not connected to an action |
| Elements inside confirmation/modal dialogs | **caution** | ⚠️ Flagged for review | May require multi-step flow |

### 8.2 Classification Logic

```ts
// src/engine/classifier/risk-classifier.ts

const DESTRUCTIVE_KEYWORDS = ['delete', 'remove', 'destroy', 'revoke', 'cancel', 'purge', 'reset', 'clear all'];
const CAUTION_KEYWORDS = ['edit', 'update', 'save', 'modify', 'change', 'overwrite'];
const EXCLUDED_PATTERNS = {
  navigation: (el: UIElement) => el.tag === 'a' || el.attributes['href'] || el.attributes['routerLink'],
  fileUpload: (el: UIElement) => el.inputType === 'file',
  orphaned:   (el: UIElement, component: ComponentInfo) => 
    !component.eventHandlers.some(h => h.associatedElement === el.id)
};

function classifyElement(el: UIElement, component: ComponentInfo): ToolRisk {
  const text = (el.label || el.attributes['aria-label'] || el.attributes['value'] || '').toLowerCase();
  
  // Check exclusions first
  for (const [, check] of Object.entries(EXCLUDED_PATTERNS)) {
    if (check(el, component)) return 'excluded';
  }
  
  // Then check risk keywords
  if (DESTRUCTIVE_KEYWORDS.some(kw => text.includes(kw))) return 'destructive';
  if (CAUTION_KEYWORDS.some(kw => text.includes(kw))) return 'caution';
  
  return 'safe';
}
```

### 8.3 Configuration Overrides

Users can override classifications via `.webmcprc.json`:

```json
{
  "classification": {
    "include": ["submit_*", "search_*"],
    "exclude": ["navigate_*"],
    "destructive": "include-with-warning",
    "navigation": "exclude",
    "customRules": [
      { "match": "*_draft", "risk": "safe" },
      { "match": "delete_account", "risk": "destructive" }
    ]
  }
}
```

---

## 9. Propose → Review → Confirm Workflow

The pipeline **never generates code without user approval** (unless `--yes` or `--all` is passed). This is the core UX loop.

### 9.1 Pipeline Stages

```
┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 1. Parse │───►│ 2. Class- │───►│ 3. Pro-  │───►│ 4. User  │───►│ 5. Gen-  │
│    AST   │    │    ify    │    │   pose   │    │  Selects │    │   erate  │
└──────────┘    └───────────┘    └──────────┘    └──────────┘    └──────────┘
                                                      │
                                                 Only selected
                                                 tools proceed
```

### 9.2 Copilot Extension (Conversational)

```
User:    @webmcp instrument this file

WebMCP:  I analyzed CheckoutPage.tsx and found 4 potential WebMCP tools:

         ✅ 1. submit_checkout_form
              Submits order with shipping & payment details
              Inputs: address, city, zip, cardNumber, expMonth, expYear, cvv
              Risk: safe

         ✅ 2. apply_promo_code
              Applies a promotional discount code
              Inputs: promoCode
              Risk: safe

         ⚠️ 3. save_payment_method
              Saves card details for future use
              Inputs: cardNumber, expMonth, expYear, cvv
              Risk: caution — modifies stored payment data

         🔴 4. delete_saved_card
              Deletes a saved payment method
              Inputs: cardId
              Risk: destructive — permanent data deletion

         Reply with the numbers to include (e.g., "1, 2, 3") or "all".

User:    1, 2

WebMCP:  ✔ Generating 2 tools...

         [code block with submit_checkout_form + apply_promo_code]

         Add to your app:
         import { registerCheckoutPageTools } from './CheckoutPage.mcp';
         registerCheckoutPageTools();
```

### 9.3 CLI (Interactive Prompt)

```
$ npx webmcp instrument ./src/CheckoutPage.tsx

  ✔ Parsed CheckoutPage.tsx
  ✔ Found 4 potential tools

  ? Select tools to generate:
    (use ↑↓ to move, space to toggle, enter to confirm)

  ❯ ◉  submit_checkout_form     (safe)    Submits order with shipping & payment
    ◉  apply_promo_code          (safe)    Applies a promotional discount code
    ◯  save_payment_method    ⚠ (caution) Saves card details for future use
    ◯  delete_saved_card      🔴 (destr.)  Deletes a saved payment method

  ✔ Generating 2 selected tools...
  ✔ submit_checkout_form — validated
  ✔ apply_promo_code — validated

  📄 Output written to: ./src/CheckoutPage.mcp.ts
```

### 9.4 Skip Flags

| Flag | Behavior |
|------|----------|
| `--yes` / `-y` | Auto-accept all `safe` + `caution` tools, skip `destructive` |
| `--all` | Accept everything including destructive (for scripts/CI) |
| `--dry-run` | Show proposal only, generate nothing |
| `--select 1,2,3` | Pre-select specific tools by index (non-interactive) |

---

## 10. User Scenario (End-to-End)

### Persona

Sarah, a frontend engineer at a SaaS startup. She has a React dashboard with 6 pages. Her PM says "make our app work with AI agents — our enterprise customers are asking for it." Sarah has heard of WebMCP but has never written a schema.

### The Story

**Step 1 — Install (30 seconds)**

```bash
npm install -g webmcp
# or: Install "WebMCP" from GitHub Copilot Extensions marketplace (one click)
```

**Step 2 — Run on a single page (2 minutes)**

```bash
$ npx webmcp instrument ./src/pages/ContactPage.tsx

  ℹ Using GitHub Models API (detected via gh CLI)
  ✔ Parsed ContactPage.tsx — found 2 potential tools

  ? Select tools to generate:
  ❯ ◉  submit_contact_form   (safe)   Submits the contact form
    ◉  clear_form             (safe)   Clears all form fields

  ✔ Generating 2 tools...
  📄 Output: ./src/pages/ContactPage.mcp.ts
```

**Step 3 — Wire it up (1 minute)**

```tsx
// In ContactPage.tsx — add 2 lines:
import { registerContactPageTools } from './ContactPage.mcp';

export default function ContactPage() {
  useEffect(() => { registerContactPageTools(); }, []);
  // ... rest of component
}
```

**Step 4 — Verify (30 seconds)**

Sarah opens her app in a browser. An AI agent visiting the page can now discover and call `submit_contact_form` and `clear_form`.

**Step 5 — Repeat for other pages (10 minutes)**

```bash
$ npx webmcp instrument ./src/pages/SettingsPage.tsx
  ✔ Found 3 tools
  ❯ ◉  update_profile        (caution) Updates user profile info
    ◉  change_password     ⚠ (caution) Changes the account password
    ◯  delete_account      🔴 (destr.)  Permanently deletes the account
  # Sarah includes 1 and 2, skips delete_account

$ npx webmcp instrument ./src/pages/SearchPage.tsx
  ✔ Found 1 tool: search_products (safe)
  # Auto-included with --yes
```

**Step 6 — Source changes later (30 seconds)**

Two weeks later, Sarah adds a phone number field to the contact form.

```bash
$ npx webmcp update
  ✔ ContactPage.tsx — source changed, regenerating...
  ✔ submit_contact_form — updated (added: phone)
  ✔ SettingsPage.tsx — no changes
  ✔ SearchPage.tsx — no changes
```

**Total time to instrument 3 pages: ~15 minutes** (vs. 3-6 hours manually).

### Scenario Coverage Checklist

| Scenario Step | Supported? | Implementation Status |
|--------------|-----------|----------------------|
| Install via npm | ✅ Yes | Standard npm publish |
| Install via Copilot Marketplace | ✅ Yes | Extension manifest |
| Auto-detect LLM backend | ✅ Yes | Hybrid auth (Section 6) |
| Parse React component | ✅ Yes | ts-morph parser |
| Classify tools by risk | ✅ Yes | Risk classifier (Section 8) |
| Show proposal + interactive select | ✅ Yes | Proposal workflow (Section 9) |
| Generate `.mcp.ts` with handler code | ✅ Yes | Code generator |
| Show wiring instructions | ✅ Yes | CLI output |
| Re-run on source change (`update`) | ✅ Yes | Idempotency lifecycle (Section 18) |
| Skip destructive tools by default | ✅ Yes | Risk classification defaults |
| Override via config file | ✅ Yes | `.webmcprc.json` |
| Copilot conversational approval | ✅ Yes | Multi-turn webhook |
| `--yes` flag for CI | ✅ Yes | CLI flags |

---

## 11. Prompt Engineering Strategy

### Guiding Principles

1. **Structured input → structured output.** Always send the `ComponentAnalysis` as clean JSON, never raw source code alone.
2. **Few-shot examples in system prompt.** Include 2-3 gold-standard input→output pairs per framework.
3. **Constrained output format.** Use JSON mode / structured output where available; otherwise validate and retry.
4. **Semantic enrichment.** The LLM's main value-add is:
   - Generating human-quality `description` fields
   - Inferring tool names from context (not just element IDs)
   - Identifying which elements logically group into a single "tool"
5. **Deterministic fallback.** If the LLM fails 2x, fall back to a template-based generator that produces correct but less descriptive output.

### Prompt Template Variables

```ts
interface PromptContext {
  componentAnalysis: ComponentAnalysis;  // From AST parser
  framework: string;
  sourceCodeExcerpt: string;            // Truncated to ~2000 tokens
  existingSchemas?: object[];           // If re-instrumenting, include previous output
  userInstructions?: string;            // From developer's chat message
}
```

---

## 12. Project Structure

```
webmcp/
├── package.json
├── tsconfig.json
├── eslint.config.js              # ESLint flat config (v9+)
├── .prettierrc
├── README.md
├── TECHNICAL_PLAN.md
│
├── src/
│   ├── index.ts                    # Main entry — CLI + server bootstrap
│   │
│   ├── server/
│   │   ├── app.ts                  # Express app setup
│   │   ├── routes/
│   │   │   ├── agent.ts            # POST /api/agent — Copilot webhook
│   │   │   └── health.ts           # GET /health
│   │   ├── middleware/
│   │   │   ├── auth.ts             # GitHub token verification
│   │   │   └── error-handler.ts
│   │   └── sse.ts                  # SSE streaming utilities
│   │
│   ├── cli/
│   │   ├── cli.ts                  # CLI argument parsing (commander)
│   │   ├── commands/
│   │   │   ├── instrument.ts       # `webmcp instrument` command
│   │   │   └── init.ts            # `webmcp init` — scaffold config
│   │   └── output.ts              # Terminal output formatting
│   │
│   ├── engine/
│   │   ├── pipeline.ts             # Orchestrates: parse → classify → propose → select → generate
│   │   ├── classifier/
│   │   │   └── risk-classifier.ts  # Tags elements as safe/caution/destructive/excluded
│   │   ├── proposal/
│   │   │   ├── proposal-builder.ts # Builds ToolProposal[] from classified analysis
│   │   │   └── tool-selector.ts   # Interactive selection (CLI: inquirer, Copilot: conversational)
│   │   ├── parser/
│   │   │   ├── index.ts            # Parser router (dispatches by file type)
│   │   │   ├── react-parser.ts     # React/JSX/TSX AST analysis
│   │   │   ├── html-parser.ts      # HTML parsing
│   │   │   ├── vue-parser.ts       # Vue 3 SFC parsing (v2 scope)
│   │   │   └── types.ts           # ComponentAnalysis, UIElement, etc.
│   │   ├── llm/
│   │   │   ├── prompt-builder.ts   # Constructs prompts from ComponentAnalysis
│   │   │   ├── prompt-templates/
│   │   │   │   ├── schema-gen.hbs  # Handlebars template for Stage 1
│   │   │   │   └── handler-gen.hbs # Handlebars template for Stage 2
│   │   │   ├── llm-client.ts       # Abstraction over Copilot/OpenAI/Ollama
│   │   │   ├── copilot-adapter.ts  # Copilot Extension LLM (server-side, X-GitHub-Token)
│   │   │   ├── github-models-adapter.ts # GitHub Models API (CLI, PAT-based)
│   │   │   ├── openai-adapter.ts   # OpenAI adapter
│   │   │   ├── ollama-adapter.ts   # Ollama adapter
│   │   │   └── none-adapter.ts     # Template-only fallback (no LLM)
│   │   ├── validator/
│   │   │   ├── schema-validator.ts # AJV-based WebMCP schema validation
│   │   │   └── syntax-validator.ts # Acorn-based handler syntax check
│   │   └── generator/
│   │       ├── code-generator.ts   # Produces final .mcp.js output
│   │       └── templates/
│   │           └── mcp-wrapper.hbs # IIFE wrapper template
│   │
│   ├── shared/
│   │   ├── logger.ts               # Structured logging (pino)
│   │   ├── config.ts               # .webmcprc.json loader
│   │   ├── constants.ts
│   │   └── hash.ts                 # Source file hashing for idempotency
│   │
│   └── types/
│       └── webmcp.d.ts             # WebMCP type definitions
│
├── test/
│   ├── unit/
│   │   ├── parser/
│   │   │   ├── react-parser.test.ts
│   │   │   └── html-parser.test.ts
│   │   ├── classifier/
│   │   │   └── risk-classifier.test.ts
│   │   ├── proposal/
│   │   │   └── proposal-builder.test.ts
│   │   ├── llm/
│   │   │   └── prompt-builder.test.ts
│   │   └── validator/
│   │       └── schema-validator.test.ts
│   ├── integration/
│   │   ├── pipeline.test.ts
│   │   └── cli.test.ts
│   └── fixtures/
│       ├── react/
│       │   ├── ContactForm.tsx
│       │   ├── LoginForm.tsx
│       │   └── Dashboard.tsx
│       ├── html/
│       │   ├── contact.html
│       │   └── checkout.html
│       └── expected/
│           ├── ContactForm.mcp.js
│           └── contact.mcp.js
│
├── docs/
│   ├── CONTRIBUTING.md
│   ├── ARCHITECTURE.md
│   └── examples/
│       ├── react-form-before-after.md
│       └── html-page-before-after.md
│
└── .github/
    ├── copilot-extensions.yml      # Copilot Extension manifest
    └── workflows/
        ├── ci.yml                  # Lint + test + build
        └── release.yml             # npm publish + Docker image
```

---

## 13. Phased Delivery Roadmap

### Phase 0 — Foundation (Week 1-2)

| Task | Deliverable |
|------|------------|
| Repo setup, TypeScript config, linting, CI | Green CI pipeline |
| Express server with health endpoint | `GET /health` returns 200 |
| Copilot Extension auth scaffolding | `POST /api/agent` accepts + verifies GitHub tokens |
| Type definitions (`ComponentAnalysis`, `ToolProposal`, etc.) | `src/engine/parser/types.ts` |
| **Milestone:** Server accepts a Copilot webhook and echoes back a test response |

### Phase 1 — React Parser + Classification + Proposal (Week 3-4)

| Task | Deliverable |
|------|------------|
| React AST parser (ts-morph) | Extracts forms, inputs, buttons, state, handlers |
| Risk classifier | Tags elements as safe/caution/destructive/excluded |
| Proposal builder | Creates `ToolProposal[]` summary from classified analysis |
| LLM prompt builder (Stage 1: schema generation) | Structured prompt from `ComponentAnalysis` |
| Copilot LLM adapter | Calls Copilot API with `X-GitHub-Token` |
| Schema validator (AJV) | Validates output against WebMCP spec |
| **Milestone:** `@webmcp instrument this file` on a React form → returns tool proposal with risk levels |

### Phase 2 — Selection + Code Gen + CLI (Week 5-6)

| Task | Deliverable |
|------|------------|
| Interactive tool selector (CLI) | `@inquirer/prompts` checkbox selection |
| Copilot conversational selection | Multi-turn webhook for proposal → user picks → generate |
| LLM prompt builder (Stage 2: handler generation) | Generates `handler` function from schema + source |
| Code generator (`.mcp.js` / `.mcp.ts` output) | Framework-appropriate output files |
| CLI with `instrument` command | `npx webmcp instrument ./file.tsx` with interactive selection |
| `--dry-run`, `--yes`, `--all` flags | Automation-friendly modes |
| GitHub Models adapter | CLI auth via `gh auth token` / `GITHUB_TOKEN` |
| Hybrid LLM auto-detection | CLI auto-picks best available backend |
| SSE streaming for Copilot Extension | Progressive output in chat |
| **Milestone:** Full end-to-end flow with human-in-the-loop approval in both CLI and Copilot Extension |

### Phase 3 — HTML Support + Polish (Week 7-8)

| Task | Deliverable |
|------|------------|
| HTML parser (htmlparser2) | Extracts forms, buttons from static HTML |
| OpenAI + Ollama LLM adapters | `--llm openai` and `--llm ollama` flags |
| `--llm none` mode (template-only) | Works without any LLM |
| `.webmcprc.json` config loader | Include/exclude rules, classification overrides |
| Error handling hardening | Graceful failures, meaningful error messages |
| Auth failure UX | Clear instructions when no LLM is available |
| Test fixtures + snapshot tests | 80%+ code coverage |
| **Milestone:** Ship-ready for public launch |

### Phase 4 — Launch (Week 9)

| Task | Deliverable |
|------|------------|
| README with GIFs/demos | Clear "hero" demo showing proposal → select → generate |
| Publish to npm (`webmcp`) | `npx webmcp` works globally |
| Publish Copilot Extension to GitHub Marketplace | One-click install |
| Hacker News "Show HN" post | Launch post with demo video |
| Dev Twitter/Bluesky thread | Social proof |

### Phase 5 — Post-Launch (Week 10+)

| Task | Deliverable |
|------|------------|
| Vue support | `.vue` SFC parsing |
| Batch/recursive mode | `webmcp instrument ./src/ --recursive` |
| Advanced config | Custom naming conventions, per-route rules |
| Community feedback triage | Issue labels, contribution guide |

---

## 14. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **WebMCP spec changes** | Generated code breaks | Abstract schema generation behind a `SpecVersion` adapter. Pin to a spec version, bump explicitly. |
| **LLM hallucinations** | Invalid schemas or broken handler code | Two-layer defense: (1) AJV schema validation, (2) Generated code syntax check via `acorn.parse()` (parser-only, no execution). Auto-retry with error context up to 2x. |
| **Large file context overflow** | LLM can't process entire component | Send only `ComponentAnalysis` (structured, compact) + truncated source excerpt (max 2000 tokens). Never send raw file. |
| **Copilot API rate limits** | Throttled during heavy use | Implement exponential backoff + queue. CLI mode supports alternative LLM backends. |
| **Security: code injection** | Malicious source code tricks LLM into harmful output | Never `eval()` or `new Function()` generated code server-side. Syntax validation uses parser-only (`acorn.parse()`). Output is always delivered as text for developer review. |
| **Copilot SDK breaking changes** | Server crashes | Pin SDK version. Monitor GitHub changelog. Wrap SDK calls in adapter layer. |
| **Idempotency / duplicate runs** | Generates duplicate `.mcp.js` files or overwrites custom edits | Hash the source file; skip regeneration if hash unchanged. Include hash in output header. On re-run with changed source, prompt user before overwriting if edits detected. |
| **`gh` CLI dependency for `--llm copilot`** | CLI fails if GitHub CLI not installed | Detect `gh` availability at startup. If missing, show install instructions and fall back to `--llm none`. Also accept `GITHUB_TOKEN` env var as alternative auth. |
| **Server abuse / webhook spam** | Resource exhaustion | Rate-limit the `/api/agent` endpoint (e.g., 30 req/min per token). Use `express-rate-limit` middleware. |

---

## 15. Developer Experience (DX) Design

### Copilot Extension Commands

| Command | Description |
|---------|------------|
| `@webmcp instrument this file` | Propose + generate WebMCP tools from the active file |
| `@webmcp instrument <filepath>` | Propose + generate tools from a specific file |
| `@webmcp explain` | Show tool proposal only, generate nothing (dry run) |
| `@webmcp schema-only` | Output only the JSON schemas, no handler code |
| `@webmcp update` | Re-generate tools for previously instrumented files (detects source changes) |
| `@webmcp help` | Show available commands |

### CLI UX (Interactive Mode)

```
$ npx webmcp instrument ./src/ContactForm.tsx

  ℹ Using GitHub Models API (detected via gh CLI)
  ✔ Parsed ContactForm.tsx — found 2 potential tools

  ? Select tools to generate:
    (space to toggle, enter to confirm)

  ❯ ◉  submit_contact_form   (safe)    Submits the contact form
    ◉  clear_form             (safe)    Clears all form fields

  ✔ Generating 2 selected tools...
  ✔ submit_contact_form — schema valid, handler valid
  ✔ clear_form — schema valid, handler valid

  📄 Output written to: ./src/ContactForm.mcp.ts

  Next step — add to your app:

  import { registerContactFormTools } from './ContactForm.mcp';
  useEffect(() => { registerContactFormTools(); }, []);
```

### CLI UX (Non-Interactive / CI)

```
$ npx webmcp instrument ./src/ContactForm.tsx --yes

  ℹ Using OpenAI (OPENAI_API_KEY detected)
  ✔ Parsed ContactForm.tsx — 2 safe tools auto-accepted
  ✔ Generating...
  📄 Output: ./src/ContactForm.mcp.ts
```

### Error UX

```
$ npx webmcp instrument ./src/App.tsx

  ✔ Parsed App.tsx
  ⚠ No instrumentable elements found in App.tsx

  This file appears to be a layout/routing component with no forms,
  buttons, or interactive elements that map to WebMCP tools.

  Tip: Try pointing at a specific page or form component instead.
       Example: npx webmcp instrument ./src/pages/ContactPage.tsx
```

---

## 16. Testing Strategy

### Test Pyramid

```
         ╱╲
        ╱  ╲        E2E (2-3 tests)
       ╱ E2E╲       Full CLI → output file validation
      ╱──────╲
     ╱        ╲     Integration (10-15 tests)
    ╱Integration╲   Pipeline: parse → prompt → validate → generate
   ╱────────────╲
  ╱              ╲  Unit (50+ tests)
 ╱     Unit       ╲ Parsers, validators, prompt builders, generators
╱──────────────────╲
```

### Key Test Cases

**Parser Tests:**
- React: simple form, multi-input form, form with validation, controlled components, uncontrolled components, no-form component (expect empty result)
- HTML: basic form, multiple forms per page, form with select/radio/checkbox, no-form page

**Classifier Tests:**
- Button with "Delete" text → destructive
- Button with "Submit" text → safe
- Navigation link → excluded
- File input → excluded
- Button with "Save" text → caution
- Custom rules in config override defaults

**Proposal Tests:**
- 4 elements → 4 proposals with correct risk levels
- `--yes` flag → only safe + caution auto-selected
- `--all` flag → everything selected
- `--select 1,3` → only those indices selected

**Validator Tests:**
- Valid schema passes
- Missing required field → fails
- Invalid tool name (uppercase, spaces) → fails
- Empty description → fails

**Auth Tests:**
- Auto-detect: OPENAI_API_KEY present → selects OpenAI
- Auto-detect: gh token with models:read → selects GitHub Models
- Auto-detect: Ollama running → selects Ollama
- Auto-detect: nothing → falls back to none
- Missing scope → clear error message

**Integration Tests:**
- ContactForm.tsx → proposal → select all → valid .mcp.ts output
- LoginForm.tsx → proposal → select all → valid .mcp.ts output with password field handling
- CheckoutPage.tsx → proposal includes destructive tool excluded by default
- Dashboard.tsx (no forms) → graceful "nothing to instrument" message

**LLM Prompt Tests (mocked):**
- Prompt includes all UIElements from analysis
- Prompt respects framework-specific rules
- Retry behavior on validation failure
- Only selected tools sent to Stage 2 generation

### Test Infrastructure

| Tool | Purpose |
|------|---------|
| `vitest` | Test runner (fast, TypeScript-native) |
| `msw` | Mock Copilot LLM API responses |
| Snapshot testing | Validate generated code hasn't regressed |
| Fixture files | Real React/HTML files as test inputs |

---

## 17. Go-to-Market Execution

### Launch Day Assets

| Asset | Purpose |
|-------|---------|
| **README.md** | Hero GIF → one-line install → "How it works" → examples |
| **Demo video** (60s) | Screen recording: install extension → trigger → see output |
| **Blog post** | "Making Every Web App Agent-Native in 30 Seconds" |
| **Show HN post** | Title: "Show HN: Auto-instrument any web app for AI agents (WebMCP)" |
| **Twitter/Bluesky thread** | 5-tweet thread with before/after code screenshots |

### Launch Checklist

- [ ] npm package published and `npx webmcp` works
- [ ] Copilot Extension listed on GitHub Marketplace
- [ ] Interactive tool selection works in CLI (`@inquirer/prompts`)
- [ ] Conversational selection works in Copilot Extension (multi-turn)
- [ ] Risk classifier correctly tags safe/caution/destructive/excluded
- [ ] `--yes`, `--all`, `--dry-run`, `--select` flags all work
- [ ] Auth auto-detection selects correct LLM backend
- [ ] Auth failure shows clear setup instructions
- [ ] README has install instructions, demo GIF showing proposal → select → generate
- [ ] CONTRIBUTING.md guides first-time contributors
- [ ] 3+ test fixture examples (ContactForm, LoginForm, CheckoutPage)
- [ ] CI/CD green with 80%+ coverage
- [ ] LICENSE (MIT)
- [ ] Show HN post drafted
- [ ] Social posts scheduled

### Success Metrics (90 Days Post-Launch)

| Metric | Target |
|--------|--------|
| GitHub stars | 500+ |
| npm weekly downloads | 200+ |
| Copilot Extension installs | 100+ |
| Open issues from community | 20+ (signals engagement) |
| External PRs merged | 5+ |

---

## 18. Idempotency & Update Lifecycle

What happens when `instrument` runs twice on the same file?

### Strategy

1. **Source hashing:** On first run, compute a SHA-256 hash of the source file and embed it in the generated output header:
   ```js
   // Source hash: a3f8c1d2e4b6...
   ```
2. **Re-run detection:** On subsequent runs, check if a `.mcp.js`/`.mcp.ts` output already exists for the target file.
3. **Decision tree:**

   | Source changed? | Output manually edited? | Action |
   |----------------|------------------------|--------|
   | No | N/A | Skip — print "Already up to date" |
   | Yes | No | Overwrite silently |
   | Yes | Yes | Warn + prompt for confirmation (CLI) or show diff (Copilot) |

4. **Manual edit detection:** Compare the existing output file's content against a clean re-generation. If they differ beyond the header, the user has hand-edited it.

### `webmcp update` Command

```bash
# Re-instrument all previously generated files whose source has changed
npx webmcp update

# Force re-generation even if source unchanged
npx webmcp update --force

# Dry-run: show which files would be updated
npx webmcp update --dry-run
```

---

## 19. Deployment & Infrastructure

### Copilot Extension Server

The server is stateless — any serverless platform works. Recommended setup:

| Platform | Config File | Notes |
|----------|------------|-------|
| **Vercel** (recommended) | `vercel.json` | Zero-config for Express, auto-scaling, free tier sufficient |
| **Render** | `render.yaml` | Good free tier, Docker support |
| **AWS Lambda** | `serverless.yml` | Best for high-scale, needs adapter (e.g., `serverless-http`) |
| **Docker** | `Dockerfile` | Self-hosting / on-prem option |

### Minimal Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No (default: 3000) | Server port |
| `LOG_LEVEL` | No (default: info) | Pino log level |
| `RATE_LIMIT_RPM` | No (default: 30) | Requests per minute per token |
| `GITHUB_TOKEN` | CLI only | PAT with `models:read` scope for GitHub Models API (alternative to `gh auth token`) |
| `OPENAI_API_KEY` | Only for `--llm openai` | OpenAI API key |
| `OLLAMA_BASE_URL` | Only for `--llm ollama` | Ollama endpoint (default: http://localhost:11434) |

---

## 20. Accessibility-Driven Enrichment

One of the biggest quality differentiators: using existing accessibility attributes to produce **better tool descriptions** than a human would write manually.

### How It Works

The AST parser already extracts `aria-label`, `aria-describedby`, `role`, and `title` attributes (via the `accessibilityHints` field on `UIElement`). The LLM prompt explicitly instructs the model to:

1. **Prefer `aria-label` over tag content** for naming tool parameters
2. **Use `aria-describedby` text** as the parameter `description` when available
3. **Infer tool purpose from `role`** attributes (e.g., `role="search"` → tool name `search_...`)
4. **Fall back** to placeholder → label → name → id (in that priority order)

### Example

```html
<input id="q" aria-label="Search products" aria-describedby="search-help" />
<span id="search-help">Enter a product name, SKU, or category</span>
```

Generates:
```json
{
  "name": "search_products",
  "description": "Search for products by name, SKU, or category",
  "inputSchema": {
    "properties": {
      "query": {
        "type": "string",
        "description": "Enter a product name, SKU, or category"
      }
    }
  }
}
```

---

## Appendix: Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.x | Language |
| `express` | ^4.x | HTTP server |
| `ts-morph` | ^22.x | TypeScript/JSX AST parsing |
| `htmlparser2` | ^9.x | HTML parsing |
| `ajv` | ^8.x | JSON Schema validation |
| `commander` | ^12.x | CLI framework |
| `ora` | ^8.x | CLI spinners |
| `chalk` | ^5.x | CLI colors |
| `prettier` | ^3.x | Code formatting |
| `pino` | ^8.x | Structured logging |
| `handlebars` | ^4.x | Prompt/code templates |
| `vitest` | ^1.x | Testing |
| `msw` | ^2.x | API mocking |
| `acorn` | ^8.x | Handler syntax validation (no-eval) |
| `express-rate-limit` | ^7.x | Webhook rate limiting |
| `@inquirer/prompts` | ^7.x | Interactive CLI selection (checkbox prompt) |
| `openai` | ^4.x | OpenAI / GitHub Models API client |
| `@github/copilot-extensions-preview-sdk` | latest | Copilot Extension SDK (pin to GA version when available) |
