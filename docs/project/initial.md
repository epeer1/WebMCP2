# Project Summary: WebMCP Auto-Instrumentor

## Executive Summary
An AI-powered developer tool that automatically upgrades existing frontend web applications (React, Vue, HTML) to be natively compatible with the emerging Web Model Context Protocol (WebMCP) standard. It eliminates the need for developers to manually write tedious JSON schemas and JavaScript tool bindings.

---

## 1. Business & Distribution Plan

**Primary Objective:** Maximize open-source reputation, community adoption, and establish a first-mover advantage in the WebMCP ecosystem (No immediate monetization).

**Target Audience:**
* Frontend Engineering Teams (Enterprise & Startup)
* AI Agent Developers 
* Open-Source Contributors

**Distribution Strategy (Two-Pronged):**
1.  **The Open-Source Engine:** A public GitHub repository housing the core Node.js/TypeScript AST parsing and LLM prompting logic. Encourages community contributions and proves technical authority.
2.  **The GitHub Copilot Extension (Primary Channel):** Packaging the engine as a free GitHub Copilot Extension. 
    * *User Friction:* Zero. Installs with one click from the GitHub Marketplace.
    * *Cost Advantage:* Utilizes the developer's existing Copilot subscription via the `@github/copilot-sdk`. Zero LLM API costs for the creator or the user.

**Go-to-Market Motion:**
* Launch the Open-Source repository.
* Publish the GitHub Copilot Extension to the Marketplace.
* Execute a "Show HN" (Hacker News) and developer-focused social media launch demonstrating how the tool instantly makes legacy React dashboards "Agent-Native."

---

## 2. Technical Plan

**Core Architecture:**
A stateless, event-driven web server acting as a secure middleman between the developer's IDE (Visual Studio Code) and GitHub's hosted LLMs.

**Tech Stack:**
* **Language:** TypeScript
* **Server Framework:** Node.js with Express.js (or Hono for edge deployment)
* **SDK:** `@github/copilot-extensions-preview-sdk` (Handles SSE streaming and auth)
* **Hosting:** Vercel, Render, or AWS Lambda (Serverless)

**Execution Workflow:**
1.  **Trigger:** Developer types `@webmcp instrument this file` inside Copilot Chat.
2.  **Payload:** GitHub POSTs a webhook to the server containing the prompt, the file's source code (context), and a short-lived `X-GitHub-Token`.
3.  **Parsing:** The server extracts the UI components (forms, buttons) from the code.
4.  **Inference:** The server uses the GitHub token to query the Copilot LLM API (GPT-4o/Claude 3.5), instructing it to map the visual elements to WebMCP JSON schemas and `window.mcp.registerTool` bindings.
5.  **Streaming:** The server streams the generated schema and JavaScript code back to the developer's IDE via Server-Sent Events (SSE).