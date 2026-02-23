# WebMCP Instrumentor 🕷️

**The Authoring Toolchain for AI-Native Web UIs**

WebMCP Instrumentor is a zero-config CLI that automatically parses your React/HTML components and **generates WebMCP tools**. It allows any AI agent (like GitHub Copilot, Claude CLI, Cursor) to physically interact with your web application in real-time—filling out forms, clicking buttons, and driving the UI safely using LLM-generated handlers and powerful risk taxonomies.

---

## ⚡ Quickstart

1. **Initialize WebMCP in your project:**
   ```bash
   npx webmcp init
   ```

2. **Instrument a component:**
   ```bash
   npx webmcp instrument src/components/ContactForm.tsx
   ```
   WebMCP will parse the React AST, find all interactive forms/buttons, and use an LLM (OpenAI, GitHub Models, or Ollama) to generate the exact JavaScript DOM handlers needed to drive them.

3. **Drop the generated file into your app:**
   ```html
   <!-- Load the generic WebMCP runtime -->
   <script src="https://unpkg.com/@webmcp/runtime"></script>
   
   <!-- Load your new auto-generated tools -->
   <script src="dist/ContactForm.mcp.js"></script>
   ```

That's it! If you have a locally running Copilot Extension or MCP server connected, your chat agent can now natively submit your Contact Form.

---

## 🏗️ How it Works

WebMCP operates in two phases: the **Build-time Instrumentor** and the **Browser Runtime**.

### 1. The Build-Time Engine (`webmcp instrument`)

When you point WebMCP at a source file (React `.tsx` or pure `.html`), the Engine goes through a pipeline:

1. **AST / HTML Parsing:** Uses `ts-morph` (for React) or `htmlparser2` (for HTML) to deeply understand the component's structure, extracting `useState` bindings, inputs, textareas, selects, and form submission boundaries.
2. **Proposal Building:** Groups related inputs (e.g., all fields within a `<form>`) into cohesive "Tool Candidates".
3. **Risk Classification:** Analyzes button labels (`"Delete Account"` vs `"Save"`) to automatically classify tools as `safe`, `caution`, or `destructive`. Destructive tools are excluded by default for safety.
4. **LLM Code Generation:** Instead of relying purely on fragile templates, WebMCP passes the specifically zoomed-in event handler to an LLM of your choice (via `--llm github-models`). We instruct it to map semantic intentions to physical DOM selectors.
5. **Output Generation:** Emits a `.mcp.js` file using a **native-first, polyfill fallback** design. It registers the tool to Chrome 146's native `navigator.modelContext` if available, otherwise falling back to our `@webmcp/runtime` injection. Includes specialized framework-bypassing DOM setters like `__mcpSetValue()`.

### 2. The Browser Runtime (`@webmcp/runtime`)

The lightweight browser script provides the `window.mcp` global array and acts as the actual communication layer (via Server-Sent Events or WebSockets) to the AI Agent. When the agent asks to "submit the contact form", the runtime executes the generated `handler` from the `.mcp.js` tool.

---

## 🛠️ CLI Reference

### `webmcp init`
Generates a `.webmcprc.json` configuration file in your project root and auto-appends `*.mcp.js` to your `.gitignore`.

### `webmcp instrument <file>`
The core command. Analyzes a file and generates the MCP integration.

**Key Flags:**
- `--llm <backend>`: Choose the AI backend for generating the tool handlers. Options:
  - `github-models` (Free if logged into `gh auth login`)
  - `openai` (Requires `OPENAI_API_KEY`)
  - `ollama` (Local execution via `OLLAMA_BASE_URL`)
  - `none` (Fallback to static template-matching)
- `--model <name>`: Override the default model (e.g., `--model gpt-4o`).
- `--yes`: Accept all safe tools without the interactive prompt.
- `--all`: Include `destructive` tools (use with extreme caution).
- `--dry-run`: Output proposals to stdout without writing files.

---

## 🚦 Framework Support Matrix

| Framework | Status | Notes |
|---|---|---|
| **React** | ✅ Native Support | Parses AST, hooks, and `onSubmit`/`onClick`. Bypasses React's internal state tracker automatically so synthetic inputs actually register. |
| **HTML** | ✅ Native Support | Reads native DOM structures, extracts form groups and native `label`s. |
| **Vue SFC** | 🚧 Planned (v2) | `.vue` parsing architecture planned. |
| **Next.js** | ⚠️ Partial | Client components fully supported. Server Components skipped intentionally (no browser UI to interact with). |

---

## 🔒 Security & Risk Taxonomies

WebMCP automatically prevents AIs from triggering destructive actions blindly. Output tools are categorized based on heuristics:

- 🟢 **Safe:** Search bars, navigation, expanders. Auto-included in `--yes`.
- 🟡 **Caution:** Form submissions, adding items, saving drafts. Requires user confirmation or `--yes`.
- 🔴 **Destructive:** Deleting resources, resetting passwords, destructive mutations. Excluded by default unless `--all` is passed.

All definitions can be overridden manually by supplying a `classifications` map inside your `.webmcprc.json`.

---

## 🔮 Native WebMCP Support & V2 Roadmap

As of early 2026, Chrome 146+ has released experimental support for **native WebMCP** via `navigator.modelContext`.

WebMCP Instrumentor is fully future-proofed and acts as an immediate bridge to this new standard. Upon code generation, our tools execute a **native-first polyfill fallback**:
1. If `navigator.modelContext` exists (Chrome 146+ with flags enabled), the tool registers directly to the spec.
2. Otherwise, it falls back to our `@webmcp/runtime` script injection, enabling identical behavior today across all browsers.

This turns our engine into a full **authoring toolchain** for building out the upcoming W3C Web Machine Learning specification, giving you React AST understanding, risk taxonomies, and LLM-driven selectors straight out of the box.

---

## 👨‍💻 Developer & Contributor Guide

WebMCP is a Turborepo monorepo.
1. `npm install`
2. `npm run build`
3. `npm run test` (Runs Vitest core suites and Playwright E2E suites)

*Built by the anti-gravity team.*
