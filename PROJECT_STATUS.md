# WebMCP Project Status & Next Steps

## 🎯 What We Accomplished

According to the `IMPLEMENTATION_DESIGN.md` and our technical plans, we have successfully developed WebMCP from the ground up across 4 major phases. 

### Phase 1: Core Engine & AST Parsing
*   **React Parser**: We built a robust parser using `ts-morph` that extracts React components, state variables (`useState`), form elements, and event handlers (`onSubmit`, `onClick`).
*   **Proposal Builder**: We implemented the logic to analyze the parsed AST, group inputs logically into forms or standalone actions, and generate JSON Schemas for the required inputs.
*   **Risk Classifier**: Tools are automatically labeled as `safe`, `caution`, or `destructive` based on heuristics (e.g., button labels like "delete" or password fields).

### Phase 2: LLM Adapters & Code Generation
*   **LLM Integration**: We built adapters for **OpenAI**, **GitHub Models**, and **Ollama**.
*   **Context-Aware Generation**: To ensure high-quality DOM manipulation code, we extract the specific React handler body (not the whole file) and feed it to the LLM to write exact DOM selectors.
*   **Template Fallback**: We implemented a `none` adapter that can generate deterministic, albeit simple, code without needing an LLM at all.
*   **Framework DOM Helpers**: We developed robust DOM injected helpers (`__mcpSetValue`, `__mcpClick`) that bypass modern framework (e.g. React) event pooling, ensuring that synthetic updates trigger actual application state changes.
*   **Interactive CLI Wizard**: A user-friendly CLI powered by `@inquirer/prompts` to select which tools to generate.

### Phase 3: HTML Support & Engine Polish
*   **HTML Parser**: We implemented parsing for raw `.html` files using `htmlparser2`, extracting standard form inputs and native groupings.
*   **Config Loader**: We integrated `cosmiconfig` to support custom `.webmcprc.json` files for user-defined configuration and risk overrides.
*   **Error Taxonomy**: We categorized errors into clear, typed `WebMCPError` classes to provide actionable feedback (e.g., `MISSING_API_KEY`).
*   **`webmcp init`**: We created the initialization command to quickly scaffold the configuration in a user's project.

### Phase 4: E2E Validation & Packaging
*   **Playwright E2E Browser Testing**: We proved the architecture works in a real browser. Playwright loads React, injects our generated tools, executes the agent handler, and successfully verifies the UI state updates natively.
*   **NPM Packaging**: We wired up `exports`, `bin`, and the monorepo `turbo build` pipeline for `@webmcp/engine`, `@webmcp/runtime`, and the `webmcp` CLI to publish to npm.
*   **Documentation**: Created a comprehensive `README.md` containing the integration guide, architecture diagram, and framework support matrix.

---

## ✅ Supported User Scenarios

As per the technical design, we have verified support for the following core scenarios:

| # | Scenario | Status | Notes |
|---|----------|--------|-------|
| 1 | Simple React form (`useState`) | ✅ Supported | Full E2E coverage. |
| 2 | React form with React Hook Form | ✅ Supported | Extractors for `useForm`/`register`. |
| 3 | React form with Formik | ✅ Supported | Extractors for `useFormik`. |
| 4 | MUI/Chakra/Ant Design components | ✅ Supported | Resolves `<TextField>` to `<input>`. |
| 5 | Static HTML page with forms | ✅ Supported | Full HTML DOM walking implemented. |
| 6 | Page with search bar | ✅ Supported | Classified as `safe`. |
| 7 | Settings page with destructive actions| ✅ Supported | e.g. "Delete Account" flagged `destructive`. |
| 8 | Login form (password field) | ✅ Supported | Passwords handled gracefully. |
| 9 | Form with file upload | ✅ Supported | Skipped/ignored (file writes blocked). |
| 10| Page with only navigation links | ✅ Supported | "No instrumentable elements" message shown. |
| 11| TypeScript strict project | ✅ Supported | Output is `.mcp.js` default to bypass strict TS issues. |
| 12| No internet / No LLM available | ✅ Supported | `--llm none` works offline. |
| 13| User edits output then re-runs | ✅ Supported | Source hashing deployed to detect manual edits. |

*(Next.js Server Components and Vue SFCs are planned for a v2 roadmap).*

---

## 🚀 Next Steps & Testing

While the unit tests (57 tests) and Playwright E2E suite are green, the following should be tested manually in the wild:

1. **Complex Production React Apps**: Run `webmcp instrument` on a massive enterprise React component to test how the AST parser handles complex spread props and deeply nested HOCs.
2. **LLM Hallucinations**: Test with `--llm ollama` (local, smaller models like `phi3`) to see if they fail to write correct DOM selectors compared to `gpt-4o`.
3. **NPM Publish Rehearsal**: Ensure `npm pack` in each package contains only the `dist/` folders and accurately resolves cross-workspace dependencies.

---

## 🔮 Native WebMCP Support & V2 Roadmap

As of February 2026, Google Chrome (v146+) has launched experimental native support for **WebMCP** via the `navigator.modelContext` API.

Our architecture has been updated to immediately bridge this standard via a **native-first polyfill fallback**:

**1. The Native API Shift (Implemented)**
Currently, the `webmcp` CLI generator emits code that targets the new native API first, falling back to our user-space polyfill if absent:
```javascript
if (typeof navigator !== 'undefined' && 'modelContext' in navigator) {
  navigator.modelContext.registerTool(toolDef);
} else {
  // Fallback to our injection
  window.mcp.registerTool(toolDef);
}
```

**2. The `@webmcp/runtime` Pivot (Implemented)**
With the above fallback, our `@webmcp/runtime` package successfully acts as the **official polyfill** (similar to the `@mcp-b/global` reference) for older browsers or those without the `#experimental-web-platform-features` flag enabled.

**3. Declarative HTML Generation (Planned V2)**
Chrome 146 introduced a declarative DOM API. For static sites without JS, our HTML parser could be updated to automatically inject these new standard attributes into the source files:
`<form toolname="book_appointment" tooldescription="..." toolautosubmit="true">`

---

## 🔌 Steps to make it fully ready as a GitHub Copilot Extension

The `@webmcp/server` package already contains the express server skeleton implementing the GitHub Copilot SSE text streaming protocol. To go live:

1. **Deploy the Server**: 
   - Deploy `@webmcp/server` to Vercel, Render, or Railway.
   - Set the `GITHUB_TOKEN` environment variable so the server can verify Copilot identity payloads.
2. **Register the GitHub App**:
   - Go to GitHub Developer Settings ➡️ GitHub Apps ➡️ **New GitHub App**.
   - Name it `WebMCP`.
   - Under the **Copilot** tab, select "App acts as a Copilot Extension".
   - Set the URL to your deployed server endpoint (e.g., `https://webmcp-server.vercel.app/api/agent`).
3. **Handle Authentication Details (Optional)**:
   - If you want the extension to read private repos to find `.mcp.js` files, ensure you request `Contents: Read` permissions in the GitHub App Settings.
4. **Publish to the Marketplace**:
   - Make the GitHub App public.
   - Users can now install it and chat: `@webmcp please fill out the contact form with my email`. The Copilot Extension will proxy through our server, match against the registered `window.mcp` tools, and invoke the UI handlers.
