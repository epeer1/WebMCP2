# webmcp-instrument-vite

> Vite plugin for zero-config [WebMCP](https://github.com/nicholasgriffintn/WebMCP) auto-instrumentation.

Scans your components at build time, proposes MCP tools, and injects them as a
virtual module — so AI assistants can interact with your app out of the box.

## Install

```bash
npm install webmcp-instrument-vite -D
npm install webmcp-instrument-runtime
```

## Setup

### 1. Configure Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import webmcp from 'webmcp-instrument-vite'

export default defineConfig({
  plugins: [react(), webmcp()]
})
```

### 2. Import the Runtime

To ensure tools are correctly registered (especially outside of browsers that natively support `navigator.modelContext`), import the runtime in your app's main entry file (e.g., `main.tsx` or `index.js`):

```ts
// src/main.tsx
import { createRoot } from 'react-dom/client'
import 'webmcp-instrument-runtime' // <-- Add this!
import App from './App'

createRoot(document.getElementById('root')).render(<App />)
```

### Options

| Option    | Type               | Default                                        | Description                                                        |
| --------- | ------------------ | ---------------------------------------------- | ------------------------------------------------------------------ |
| `include` | `string[]`         | `['src/**/*.tsx', 'src/**/*.jsx', 'src/**/*.vue']` | Glob patterns for component files to scan                          |
| `inject`  | `'html' \| 'entry'` | `'html'`                                       | Injection strategy (see below)                                     |
| `entry`   | `RegExp \| string` | `/\/src\/main\.(tsx?\|jsx?)$/`                  | Entry file pattern (only used with `inject: 'entry'`)              |

### Injection Strategies

**`'html'`** (default) — injects `<script type="module" src="/@id/virtual:webmcp-tools">` via Vite's HTML pipeline. Works for all standard Vite apps.

**`'entry'`** — prepends `import 'virtual:webmcp-tools'` to your app's entry file via a transform hook. Use this if `'html'` causes issues in your setup (e.g. SSR builds).

```ts
// SSR or non-standard entry example
webmcp({ inject: 'entry', entry: 'src/app.tsx' })
```

## Verify

After starting your dev server, open the browser console and check:

```js
// Either of these should exist
window.mcp           // WebMCP polyfill runtime
navigator.modelContext // Chrome native WebMCP API
```

## How it works

1. **Scan** — On build start, the plugin globs your component files and parses them for interactive elements (forms, buttons, inputs, etc.)
2. **Propose** — Each element is turned into an MCP tool proposal with a name, description, input schema, and risk level
3. **Generate** — Tool proposals are compiled into executable JS code (DOM helpers + tool registration)
4. **Inject** — The generated code is served as a Vite virtual module (`virtual:webmcp-tools`) that registers all tools at runtime
5. **HMR** — When you edit a component, the virtual module is re-generated and the page hot-reloads

## License

MIT
