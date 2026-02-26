# WebMCP Instrumentor 🕷️

[![npm: webmcp-instrument](https://img.shields.io/npm/v/webmcp-instrument?label=webmcp-instrument&color=blue)](https://www.npmjs.com/package/webmcp-instrument)
[![npm: webmcp-instrument-vite](https://img.shields.io/npm/v/webmcp-instrument-vite?label=vite-plugin&color=blue)](https://www.npmjs.com/package/webmcp-instrument-vite)
[![npm: webmcp-instrument-engine](https://img.shields.io/npm/v/webmcp-instrument-engine?label=engine&color=blue)](https://www.npmjs.com/package/webmcp-instrument-engine)
[![npm: webmcp-instrument-runtime](https://img.shields.io/npm/v/webmcp-instrument-runtime?label=runtime&color=blue)](https://www.npmjs.com/package/webmcp-instrument-runtime)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**The Authoring Toolchain for AI-Native Web UIs**

WebMCP Instrumentor is a zero-config suite that automatically parses your React/Vue/HTML components and **generates WebMCP tools**. It allows any AI agent (like GitHub Copilot, Claude CLI, Cursor) to physically interact with your web application in real-time—filling out forms, clicking buttons, and driving the UI safely using LLM-generated handlers and powerful risk taxonomies.

---

## 📦 Installation

```bash
npm install -D webmcp-instrument
```

Or for **Vite** projects (recommended):

```bash
npm install -D webmcp-instrument-vite webmcp-instrument-engine webmcp-instrument-runtime
```

### Packages

| Package | Purpose |
|---------|---------|
| [`webmcp-instrument`](https://www.npmjs.com/package/webmcp-instrument) | CLI — the main entry point. Run `npx webmcp-instrument` to instrument your components. |
| [`webmcp-instrument-vite`](https://www.npmjs.com/package/webmcp-instrument-vite) | Vite plugin — zero-config auto-instrumentation during `npm run dev`. |
| [`webmcp-instrument-engine`](https://www.npmjs.com/package/webmcp-instrument-engine) | Core engine — AST parsing, code generation, risk classification. Used internally by the CLI and Vite plugin. |
| [`webmcp-instrument-runtime`](https://www.npmjs.com/package/webmcp-instrument-runtime) | Browser runtime — tiny helper injected into your app to bridge AI agents and the DOM. |

---

## ⚡ Quickstart

### Integration via Vite (Recommended)

Drop the plugin into your Vite build to automatically detect components and generate native Agent tools on the fly:

1. **Install the WebMCP Instrumentor plugin:**
   ```bash
   npm install -D webmcp-instrument-vite webmcp-instrument-engine webmcp-instrument-runtime
   ```

2. **Add to `vite.config.ts`:**
   ```typescript
   import webmcp from 'webmcp-instrument-vite';

   export default defineConfig({
     plugins: [
       webmcp({ include: ['src/**/*.tsx', 'src/**/*.vue'] })
     ]
   });
   ```

That's it! When you run `npm run dev`, your components are automatically parsed into `navigator.modelContext` tools straight out of the box.

### Manual Instrumention (CLI)

1. **Initialize WebMCP Instrumentor in your project:**
   ```bash
   npx webmcp-instrument init
   ```

2. **Instrument a component:**
   ```bash
   npx webmcp-instrument instrument src/components/ContactForm.tsx
   ```
   The instrumentor will parse the component AST, find all interactive forms/buttons, and use an LLM (OpenAI, GitHub Models, or Ollama) to generate the exact JavaScript DOM handlers needed to drive them.

3. **Drop the generated file into your app:**
   ```html
   <!-- Load the generic WebMCP runtime -->
   <script src="https://unpkg.com/webmcp-instrument-runtime"></script>
   
   <!-- Load your new auto-generated tools -->
   <script src="dist/ContactForm.mcp.js"></script>
   ```

---

## 🏗️ How it Works

WebMCP Instrumentor operates in two phases: the **Build-time Instrumentor** and the **Browser Runtime**.

### 1. The Build-Time Engine

When you point the instrumentor at a source file (React `.tsx`, Vue `.vue`, or pure `.html`), the Engine goes through a pipeline:

1. **AST / HTML Parsing:** Uses `ts-morph` (for React), `@vue/compiler-sfc` (for Vue), or `htmlparser2` (for HTML) to deeply understand the component's structure, extracting `useState` bindings, inputs, textareas, selects, and form submission boundaries.
2. **Proposal Building:** Groups related inputs (e.g., all fields within a `<form>`) into cohesive "Tool Candidates".
3. **Risk Classification:** Analyzes button labels (`"Delete Account"` vs `"Save"`) to automatically classify tools as `safe`, `caution`, or `destructive`. Destructive tools are excluded by default for safety.
4. **Hybrid Discovery & Deterministic Hashing:** The engine boots a **Headless Playwright Probe** against your local development server to extract the live Ground Truth Accessibility Tree. It matches this against the AST to triangulate highly resilient, self-healing CSS selector fallbacks. It also calculates a deterministic SHA-256 tool hash based strictly on semantic intent, ensuring your tools don't break when you merely refactor CSS layouts.
5. **Confidence Threshold Policy:** If extracted tools score below `< 0.6` match confidence (e.g. nested identical list loops without IDs), the engine warns the developer and blocks autonomous LLM generation to prevent agent hallucination, prompting for `data-mcp` hook injection.
5. **Output Generation:** Emits native-first code. It registers the tool to Chrome 146's native `navigator.modelContext` if available, otherwise falling back to our `webmcp-instrument-runtime` injection. Includes specialized framework-bypassing DOM setters like `__mcpSetValue()`.

### 2. The Browser Runtime (`webmcp-instrument-runtime`)

The lightweight browser script provides the `window.mcp` global array and acts as the actual communication layer to the AI Agent. When the agent asks to "submit the contact form", the runtime executes the generated `handler`.

---

## 🛠️ CLI Reference

### `webmcp-instrument init`
Generates a `.webmcprc.json` configuration file in your project root and auto-appends `*.mcp.js` to your `.gitignore`.

### `webmcp-instrument instrument <file>`
The core command. Analyzes a file and generates the MCP integration.

**Key Flags:**
- `--llm <backend>`: Choose the AI backend for generating the tool handlers. Options:
  - `github-models` (Free if logged into `gh auth login`)
  - `openai` (Requires `OPENAI_API_KEY`)
  - `ollama` (Local execution via `OLLAMA_BASE_URL`)
  - `none` (Fallback to static template-matching)
- `--model <name>`: Override the default model (e.g., `--model gpt-4o`).
- `--url <url>`: Target the local dev server for the Playwright Ground Truth Probe (default: `http://localhost:3000`).
- `--yes`: Accept all safe tools without the interactive prompt.
- `--all`: Include `destructive` tools (use with extreme caution).
- `--dry-run`: Output proposals to stdout without writing files.

---

## 🚦 Framework Support Matrix

| Framework | Status | Notes |
|---|---|---|
| **React** | ✅ Native Support | Parses AST, hooks, and `onSubmit`/`onClick`. Bypasses React's internal state tracker automatically so synthetic inputs actually register. |
| **Vue SFC** | ✅ Native Support | Deeply parses `.vue` template markup and `<script setup>` variables. Bypasses Proxy DOM reactivity logic cleanly. |
| **HTML** | ✅ Native Support | Reads native DOM structures, extracts form groups and native `label`s. |
| **Next.js** | ⚠️ Partial | Client components fully supported. Server Components skipped intentionally (no browser UI to interact with). |

---

## 🔒 Security & Risk Taxonomies

The instrumentor automatically prevents AIs from triggering destructive actions blindly. Output tools are categorized based on heuristics:

- 🟢 **Safe:** Search bars, navigation, expanders. Auto-included in `--yes`.
- 🟡 **Caution:** Form submissions, adding items, saving drafts. Requires user confirmation or `--yes`.
- 🔴 **Destructive:** Deleting resources, resetting passwords, destructive mutations. Excluded by default unless `--all` is passed.

All definitions can be overridden manually by supplying a `classifications` map inside your `.webmcprc.json`.

---

## 🔮 Native WebMCP Support & V2 Architecture

As of early 2026, Chrome 146+ has released experimental support for **native WebMCP** via `navigator.modelContext`.

WebMCP Instrumentor is fully future-proofed and acts as an immediate bridge to this new standard. Upon code generation, our tools execute a **native-first polyfill fallback**:
1. If `navigator.modelContext` exists (Chrome 146+ with flags enabled), the tool registers directly to the spec.
2. Otherwise, it falls back to our `webmcp-instrument-runtime` script injection, enabling identical behavior today across all browsers.

---

## 👨‍💻 Developer & Contributor Guide

WebMCP Instrumentor is a Turborepo monorepo.
1. `npm install`
2. `npm run build`
3. `npm run test` (Runs Vitest core suites and Playwright E2E suites)

*Built by the anti-gravity team.*
