# WebMCP: Roadmap to Public Launch 🚀

This document outlines the exact steps required to take the WebMCP Monorepo from your local machine and publish it to the npm registry so developers across the world can `npm install -D @webmcp/vite-plugin`.

## 1. Prepare NPM Registry Metadata

Before publishing, we must ensure every `package.json` in the monorepo has valid metadata, a unified version, and correct repository links.

### **To-Do Checklist for `package.json` files:**
- [ ] Add `"repository": { "type": "git", "url": "https://github.com/epeer1/WebMCP2" }`
- [ ] Add `"author"` and `"license": "MIT"`
- [ ] Ensure `"keywords"` contain `["webmcp", "ai", "vite", "copilot", "mcp"]`
- [ ] Add `"description"` specific to each package.
- [ ] Ensure all local `"workspace:*"` dependencies are swapped to explicit versions (e.g. `"@webmcp/engine": "^0.2.0"`) prior to the final publish push, or use a tool like `syncpack`/`changesets` to handle it.

**Packages to prep:**
1. `packages/engine`
2. `packages/runtime`
3. `packages/cli` (The `webmcp` binary)
4. `packages/vite-plugin`

## 2. Setting up the NPM Organization
You need an npm organization to publish scoped packages under `@webmcp`.

1. Go to [npmjs.com](https://www.npmjs.com/) and log in.
2. Click on your profile picture -> **Add Organization**.
3. Create the `@webmcp` organization (Note: if the name `webmcp` is taken, you might need to use `@webmcp-dev` or `@epeer1/webmcp`).

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
npm run clean
npm run build
npm run test
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
2. Draft a new Release called **v0.2.0: The V2 Architecture (Vue + Vite Integration)**.
3. Post the announcement to LinkedIn outlining:
   - "Zero-Thought" Code Generation via AST
   - Hot Module Replacement injected tools via Vite
   - Seamless Chrome 146 Native Model Context Support
