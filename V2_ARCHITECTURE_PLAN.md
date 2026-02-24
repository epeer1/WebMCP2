# WebMCP V2: Persistent DX Plugin Architecture

## The Core Philosophy (Model 2)

WebMCP is evolving from a **one-time code generator CLI** into a **persistent developer experience (DX) pipeline**. 

If developers have to remember to run a CLI every time they change a UI element, the tool registry will inevitably fall out of sync with the actual DOM, causing AI agents to fail. To achieve mass adoption, WebMCP must behave like a compiler plugin (e.g., Tailwind, Prisma, next-intl).

**The V2 Vision:**
1. Installed once as a `devDependency`.
2. Stays in sync automatically by hooking directly into the build pipeline (`vite dev`, `next dev`).
3. Ships only a lightweight, high-performance JS payload that registers tools via Chrome's native `navigator.modelContext` (with a polyfill fallback).

---

## Architecture Design

### 1. The Build-Time Engine (`@webmcp/engine` & Plugins)
The heavy lifting—AST parsing, risk classification, and LLM code generation—never ships to production. It runs strictly on the developer's machine during the build.

*   **File Watcher & Incremental Generation**: The plugin watches specific UI directories (e.g., `src/components`). When a file is saved, it incrementally regenerates *only* the affected tools.
*   **Precision LLM Caching**: Generating DOM selectors via LLMs is brilliant for handling complex UI libraries, but doing it on every save is slow and expensive. The engine computes a hash of **only the interactive surface** (the forms, inputs, buttons, labels, and submit boundaries) rather than the whole file AST. 
    *   If only styling (Tailwind classes) or surrounding markup changes → no LLM call is triggered. 
    *   If only text labels change → the risk classification may update, but existing selectors are preserved.
*   **Deterministic Fallback Circuit Breaker**: If the developer is offline, or the LLM is rate-limited/unavailable, the build step is never blocked. The engine instantly falls back (`--llm none`) to generate "best effort" selectors using deterministic AST heuristics. These can be optionally "upgraded" via the LLM later when connectivity is restored.

### 2. The Auto-Injection (Virtual Module)
The developer should never have to manually add `<script src="dist/ContactForm.mcp.js">` to their `index.html`. 
The Vite/Next.js plugins automatically aggregate all generated `.mcp.js` files into a single virtual module (`virtual:webmcp-tools`) and inject the registration chunk into the application's entry point.

**The HMR Mental Model:**
1.  The `virtual:webmcp-tools` module exports a unified tool registry.
2.  When a developer modifies a tracked `.tsx` file, the engine incrementally updates the specific `.mcp.js` handler.
3.  Vite's HMR invalidates the `virtual:webmcp-tools` module.
4.  The runtime immediately hot-swaps the updated definitions and re-registers the tools via `navigator.modelContext`, providing zero-latency sync with the AI agent.

### 3. Security & Safety by Default
The system is built on trust. We ensure AI agents cannot silently damage the application:
1.  **Destructive Isolation**: Actions flagged as `destructive` (e.g., "Delete Account") are automatically excluded from the generated bundle. They must be explicitly enabled via `.webmcprc`.
2.  **Explicit Scope Allowlisting**: WebMCP does not blindly scan the whole codebase. Developers explicitly define an `include` array (e.g., `["src/forms"]`) to gate which directories can emit agent-accessible tools.
3.  **Runtime Interception Hooks**: For tools classified as `caution`, the generated code wraps the execution in a runtime confirmation hook (e.g., `window.confirm()`), ensuring developer/user oversight even during dev mode testing.

---

## Implementation Plan

### Phase 1: Engine Incremental Capabilities
1.  **Surface Hashing Cache**: Implement `.webmcp/cache.json` in the project root to store interactive surface hashes and existing LLM-generated handlers.
2.  **Diff Engine**: When a file is modified, compare the new AST interactive structures against the cache. Only dispatch LLM calls if the physical structure of the form changed.

### Phase 2: Build Tool Plugins
1.  **`@webmcp/vite-plugin`**: Build a rollup plugin utilizing `chokidar` for watching files during `vite dev`. Hook into the `load` and `resolveId` phases to serve the `virtual:webmcp-tools` module.
2.  **Plugin Client**: Create a small client-side script injected by the plugin that automatically `import`s the virtual tools and initializes the `window.mcp` array (if the native polyfill is needed).

### Phase 3: Developer Experience (DX) Refinements
1.  **Console Status**: Output clean logs to the Vite dev server console (e.g., `[WebMCP] Incremental update: 1 tool updated in 12ms. (LLM bypassed)`).
2.  **Configuration**: Enhance `.webmcprc.json` to handle the `include` scope allowlist and manual risk overrides.

---

## How to Test This as a New User (V2 Walkthrough)

To ensure this shift actually delivers the "Zero-Thought" developer experience, we will validate the workflow through the eyes of a brand new user.

### Step 1: Installation
1.  Start with a fresh Vite + React project.
2.  Run the installation:
    ```bash
    npm install -D @webmcp/vite-plugin @webmcp/engine
    ```

### Step 2: Configuration
1.  Open `vite.config.ts`, add the plugin, and declare your explicit safety allowlist:
    ```typescript
    import { defineConfig } from 'vite'
    import react from '@vitejs/plugin-react'
    import webmcp from '@webmcp/vite-plugin'

    export default defineConfig({
      plugins: [
        react(),
        webmcp({
          include: ['src/components/forms/**/*.tsx']
        })
      ],
    })
    ```

### Step 3: Development & Iteration (The Magic Moment)
1.  Run the development server:
    ```bash
    npm run dev
    ```
2.  Create a form inside `src/components/forms/Signup.tsx` containing an `email` input and a `Submit` button.
3.  **Observation**: The terminal prints: `[WebMCP] Found 1 tool (SignupForm). Generating selectors (using LLM)... Done.`
4.  Open the browser Console and type `window.mcp` (or inspect `navigator.modelContext`). **The tools are there dynamically.**
5.  Change the styling of the submit button (`className="bg-blue-600"`) and save.
6.  **Observation**: The console immediately prints: `[WebMCP] Incremental update (LLM bypassed)`. The tools are updated in milliseconds via HMR without a slow LLM roundtrip.
