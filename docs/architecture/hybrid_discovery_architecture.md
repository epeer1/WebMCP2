# WebMCP: The Hybrid Discovery Architecture

**WebMCP is both a tool authoring compiler and a policy enforcement layer for agentic UI actions.**

Our goal is to build a hyper-reliable, "brilliant" discovery phase for the WebMCP Instrumentor. The current pure-AST approach is fragile because it cannot see past complex abstractions (like MUI, Radix, Quasar) or elements rendered outside the React/Vue component tree (modals/portals).

This document outlines the architecture to transition WebMCP into a robust, deterministic **Authoring API** that can power both our CLI and future IDE extensions.

---

## 🏗️ 1. The Core Architecture (AST + Probe)

To solve the "black box" abstraction of UI libraries, we are deploying a **Hybrid Discovery Pipeline**:

1. **Static Intent Discovery (AST Parsing):**
   - Extract semantic intent from source code (`.tsx`, `.vue`, `.html`).
   - Extract ARIA properties, field labels, placeholders, and roles instead of just raw `div`s.
   - Group fields logically into "Tool Candidates" (e.g., matching a `firstName` and `lastName` input into a unified "Account Creation Tool").
   - **Tool Identity Stability:** Tools receive a deterministic execution ID derived from a hash of the AST source intent. This hash includes normalized semantic intent (labels, roles, field keys, and form boundaries) but explicitly excludes layout or styling. While the LLM can rewrite the human-readable schema `name`, the underlying `id` remains absolutely stable even if developers move `div`s around.

2. **Runtime Ground Truth (Dev-Mode Headless Probe):**
   - Fire a lightweight headless probe against the local dev server (e.g., Playwright interacting with Vite). **Crucially, this probe runs strictly in development mode during the generation phase and never ships to or executes in production.**
   - **State Discovery Harness (`webmcp.harness.ts`):** To ensure the probe doesn't miss modals or step-wizards, we introduce a central `webmcp.harness.ts` file. By utilizing TypeScript rather than a custom JSON DSL, developers can export standard Playwright async setup scripts (e.g., `await page.click('#open-modal')`) allowing the probe to reach complex nested states natively before scanning.
   - Resolve modals, portals, and heavy abstractions (Quasar/MUI) by checking the actual accessibility tree and physical DOM structure across these defined states.
   - Prove that the AST intent physically exists on the page.

3. **The AST $\leftrightarrow$ Runtime Matching Algorithm:**
   - Once we have the AST intents and the Runtime DOM tree, we map them using a resilient proximity algorithm. The **Final Match Score** is a weighted sum of the following signals, with explicit tie-breakers (e.g., label similarity > container proximity):
     1. **Name/ID Mapping:** Exact or substring matches of component `name` / `id` props to DOM attributes.
     2. **Label Text Similarity:** Normalized Levenshtein distance between AST extracted labels and Runtime Accessible Names.
     3. **Role/Name Matching:** Matching the AST inferred role (e.g. `button`) and the calculated interactive name.
     4. **ARIA-labelledby Linkage:** Verifying if runtime ARIA pointers align with AST structural context.
     5. **Bounding Container Proximity:** If all else fails, checking if elements share the same semantic boundaries (like a `<form>` container or grouped `div`).

4. **Selector Synthesis, Confidence Scoring & Format:**
   - Instead of asking an LLM to guess a React selector, we combine the AST and Probe data to generate an array of **confidence-scored fallback selectors**.
   - **Runtime Selector Strategy Format:** Each selector is emitted as a structured object: `{ strategy: "testid" | "label" | "role" | "css", value: "...", score: 0.8 }`
   - **Confidence Score Priorities:**
     1. `data-testid` / `data-mcp` (Score: 1.0)
     2. Exact accessible `<label>` text (Score: 0.8)
     3. ARIA `role` + accessible name (Score: 0.6)
     4. CSS Structural paths (Score: 0.2)
   - **Confidence Threshold Policy:** If the maximum selector confidence for a tool field is `< 0.6`, the element is marked as unstable. The CLI will reject silent execution and instead output actionable guidance requiring the developer to either: (a) Add a `data-mcp` hook, (b) refine `webmcp.harness.ts` state, or (c) enable LLM assist to improve the matching metadata (label/role/name).

---

## 🧠 2. The Role of the LLM vs. The Engine

We are radically shifting *what* we ask the LLM to do.

*   **Execution (Writing Selectors): NO LLM NEEDED.** 
    The `webmcp-instrument-runtime` handles execution deterministically using the array of fallback selectors curated by our discovery engine. It is instant, self-healing, and requires zero LLM API calls, completely isolating issues of latency during agent interaction.
*   **Discovery (Synthesizing Intent): LLM REQUIRED.**
    We feed the brilliant "Ground Truth Map" curated by our engine to the LLM. 
    > **The Ground Truth Map Contract:** A JSON structure representing `tools → fields → selector fallback arrays → confidence → risk category`. This acts as the stable contract between the engine, the execution runtime, and any future IDE extensions.
    The LLM's job is solely to understand the *semantics* of this JSON structure and conceptualize the tool (e.g. naming the flow `"checkout_cart"` and writing the JSON schema description). It maps messy UI to clean API schemas.

---

## 🔌 3. Developer Onboarding friction & LLM Connections

If developers have to wrestle with OpenAI keys or pay for Anthropic just to generate WebMCP schemas, adoption will die. We solve this by operating in two tiers:

### Tier 1: The Magic CLI (The Current Focus)
We run an autonomous CLI agent leveraging **GitHub Models (`--llm github-models`)**. 
When available via an authenticated `gh` session, we leverage Microsoft's free GPT-4o inference tier implicitly based on the developer's local token. This creates a frictionless experience without the need for manual API keys. If offline or unauthenticated, a deterministic heuristic fallback (`--llm none`) bridges the gap.

### Tier 2: The "Native" Extension (The Future Target)
The ultimate target for WebMCP is a native VSCode/Cursor Extension (`webmcp-vscode`).
Our CLI's Discovery Engine (Phase 1/2) outputs the exact "Ground Truth JSON Map." Instead of WebMCP handling the LLM logic, we hand that JSON Map directly to the native `vscode.lm` API.
This allows Cursor or Copilot users to generate WebMCP tooling natively inside their editor, fully utilizing their existing $20/month subscription (using Claude 3.5 Sonnet / GPT-4o) with absolutely zero friction.

---

## 🛡️ 4. Cyber Security & Risk Mitigation (The Policy Engine)

In an era of Agentic AI, autonomous LLMs introduce a novel threat vector: **AI-Driven UI Manipulation**. Systems that grant LLMs visual cursor control (like Claude Computer Use) are highly susceptible to malicious Prompt Injection (e.g., an XSS comment commanding the AI to "Click Delete Account"). Because they read the DOM dynamically at runtime, they possess zero understanding of risk or authorization.

WebMCP mitigates these vulnerabilities by acting as a **Security Policy Engine for AI Agents**:

1.  **The Mitigation of Prompt Injection (Risk Taxonomies):**
    Because WebMCP extracts intent statically at build-time, we encode the developer's semantic knowledge into an immutable contract. The compiler automatically flags tools (e.g., `checkout` = `caution`, `delete_user` = `destructive`). If an AI is tricked via Prompt Injection into executing a destructive tool, the `webmcp-instrument-runtime` physically blocks silent execution, enforcing a native browser confirmation dialog.
2.  **Deterministic Tool Contract (Build-time Verified Targets):**
    A bad actor attempting an XSS attack might inject a fake `<button>` designed to intercept data or trigger malicious flows if clicked by an Agent. Because the WebMCP runtime solely acts on pre-discovered targets using a strict selector strategy (rather than interacting with "any new DOM element"), injected elements that are not part of the discovered states and don't match stable selectors within the verified state containers are fundamentally ignored.
3.  **Reducing Accidental Exfiltration (Default-Deny Optics):**
    Agents tricked into reading the DOM visually can accidentally exfiltrate sensitive data. WebMCP's runtime API reduces accidental exfiltration by default-denying access to sensitive fields (e.g., password-like inputs) and requiring strict, explicit opt-ins via typed schemas for read access.

---

## 📋 5. Execution Plan (Next Steps)

1.  **Phase 1 — AST Enhancements:** Upgrade the React/Vue parsers to extract semantic intent (ARIA props, labels, placeholders) so we can map intent to UI rather than just bare HTML elements.
2.  **Phase 2 — The Runtime Probe:** Build the dev-mode probe script that hits the local server and builds an accessibility tree, confirming elements like MUI `<TextField>` rendered successfully.
3.  **Phase 3 — Selector Scoring:** Build the engine that merges AST and Probe data into prioritized fallback arrays.
4.  **Phase 4 — Self-Healing Runtime:** Upgrade `webmcp-instrument-runtime` to loop through fallback selectors at execution time instantly without LLM latency.
5.  **Phase 5 — End-to-End Stress Validation:** Build a synthetic `Component Playground` app specifically designed to test the architectural limits of the Hybrid Pipeline. This validation suite will programmatically test:
    - **Portal Modals** (Radix/MUI dialogs escaping the DOM tree).
    - **Step-Wizards** (Utilizing `webmcp.harness.ts` to navigate deeply nested conditional routes).
    - **Dynamic ID Injection** (Testing selector fallback durability when CSS/IDs change between renders).
    - **Obfuscated Labels** (Elements with `aria-labelledby` linked to detached sibling `span`s).

---

## 🚫 6. Non-goals

To ensure the boundaries of this system are clearly understood, WebMCP is explicitly:
- **Not an authorization system:** It relies entirely on the application's underlying authentication and authorization logic.
- **Not a replacement for server-side policy:** WebMCP enforces client-side execution boundaries, but backend checks are still mandatory.
- **Not guaranteed to discover universally hidden UI:** It will not discover highly conditional UI elements unless they are explicitly reachable via the defined `webmcp.harness.ts` states.
