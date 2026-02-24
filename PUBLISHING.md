# WebMCP Instrumentor: Roadmap to Public Launch 🚀

This document outlines the exact steps required to take the monorepo from your local machine and publish it to the npm registry so developers across the world can `npm install -D webmcp-instrument-vite`.

## 1. Prepare NPM Registry Metadata

Before publishing, we must ensure every `package.json` in the monorepo has valid metadata, a unified version, and correct repository links.

### **To-Do Checklist for `package.json` files:**
- [x] Add `"repository": { "type": "git", "url": "https://github.com/epeer1/WebMCP2" }`
- [x] Add `"author"` and `"license": "MIT"`
- [x] Ensure `"keywords"` contain `["webmcp", "ai", "vite", "copilot", "mcp"]`
- [x] Add `"description"` specific to each package.
- [x] Ensure all local dependencies are explicit versions.

**Packages to prep:**
1. `packages/engine` (NPM: `webmcp-instrument-engine`)
2. `packages/runtime` (NPM: `webmcp-instrument-runtime`)
3. `packages/cli` (NPM: `webmcp-instrument`)
4. `packages/vite-plugin` (NPM: `webmcp-instrument-vite`)

## 2. Setting up the NPM Publisher
Since we are using direct, un-scoped packages instead of an `@organization` scope, you simply need a standard NPM account.

1. Go to [npmjs.com](https://www.npmjs.com/) and log in.
2. Ensure your account is verified.

## 3. The Local Publishing Guide (CLI)
Here are the exact terminal commands you will run on your local machine to deploy the code to the world.

### Step 3.1: Authenticate
Open your terminal and authenticate to npm:
```bash
npm login
```

### Step 3.2: Clean Build and Test
Run a full clean build of the monorepo to generate fresh `dist` folders.
```bash
npm run build
```
*Note: We have E2E tested the Vue and React applications, so we know the pipeline works.*

### Step 3.3: Publish the Packages
Publish them in dependency order so that the downstream packages can resolve them. Navigate to each directory and run `npm publish --access public`.

1. **The core components:**
```bash
cd packages/runtime && npm publish --access public
cd ../engine && npm publish --access public
```

2. **The developer integrations:**
```bash
cd ../vite-plugin && npm publish --access public
cd ../cli && npm publish --access public
```

## 4. GitHub Release & Marketing
Once published:
1. Go to your GitHub Repository `WebMCP2`.
2. Draft a new Release called **v0.2.0: WebMCP Instrumentor (Vue + Vite Integration)**.
3. Post the announcement to LinkedIn outlining:
   - "Zero-Thought" Code Generation via AST
   - Hot Module Replacement injected tools via Vite
   - Seamless Chrome 146 Native Model Context Support
