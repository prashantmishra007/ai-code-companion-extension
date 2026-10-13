# 🚀 Gemini AI Code Companion (Dev Refactor AI)
🛠️ Architecture & Tech Stack
Core Engine: VS Code Extension API (vscode)

AI Model Engine: Google Gemini API (Multi-model Waterfall Fallback via @google/genai / REST)

Language & Runtime: TypeScript, Node.js

Build & Packaging: tsc, @vscode/vsce

Distribution: Visual Studio Marketplace & GitHub Releases

📦 Getting Started & Setup
Prerequisites
Visual Studio Code (v1.85.0 or later)

Node.js (v18.x or later)

A valid Google Gemini API Key
Local Development & Setup

(1) Clone the repository:
git clone [https://github.com/prashantmishra007/ai-code-companion-extension.git](https://github.com/prashantmishra007/ai-code-companion-extension.git)
cd ai-code-companion-extension

(2) Install dependencies:
npm install

(3) Compile the extension:
npm run compile

(4) Launch Extension in Debug Mode:
*Open the project in VS Code (code .).
*Press F5 to open an Extension Development Host window with the extension loaded.

License
This project is licensed under the MIT License - see the LICENSE file for details.



🚀 What's New in v0.0.4 (Latest Release)
⚡ Waterfall Fallback Architecture: Engineered multi-model routing across Gemini 3.8 Flash and Flash-Lite with automatic backoff retry to eliminate 503 high-traffic spikes and quota limits.

📸 Interactive Audio Cue: Added an authentic camera shutter audio snap that plays instantly upon response generation completion.

🎯 Single Block Refactor: Enforced strict LLM constraints ensuring output is returned as exactly one clean, production-ready code block.

🛒 Visual Studio Marketplace Verified: Officially published and available globally across all VS Code installations.

🌟 Key Features Showcase
1. ⚡ Ghost-Text Inline Autocomplete
Low-latency GitHub Copilot-style inline code suggestions in gray text as you type.

Accept suggestions instantly with Tab or toggle suggestions on/off using Alt + \.

2. 💬 Interactive Sidebar Chat Assistant
Sleek glassmorphism UI embedded in the VS Code Activity Bar.

One-click action triggers: Fix & Refactor, Explain Code, and custom conversational debugging.

3. ✍️ Comment-to-Code Generation
Simply write a comment (e.g. // function to find factorial of a number) and watch Gemini synthesize idiomatic, fully functional implementations automatically.

4. 🎯 Floating Inline Edit (Ctrl + I)
Select any block of code and press Ctrl + I to trigger an in-place floating input.

Prompt natural language instructions (e.g., "Convert to async/await", "Add input validation") without leaving the editor canvas.

5. 🔀 Native Split Diff Viewer
Review all AI-generated code transformations side-by-side (Original ↔ Gemini Edit) before committing changes to your workspace.

6. 🛠️ Terminal Error Auto-Fixer
Automatically diagnose complex shell, runtime, or package manager errors (such as npm ERR! ERESOLVE).

Provides instant root-cause breakdowns and ready-to-run copyable terminal commands.

7. ✨ AI Git Commit Message Generator
Directly integrated into the VS Code Source Control panel title bar (✨ icon).

Automatically reads staged changes (git diff --cached) and crafts conventional semantic commit messages (e.g., feat: ..., fix: ...).

8. 🛡️ Real-Time Security & Secret Scanner
Audits files on save for exposed credentials, Google API keys, database connection strings, JWT tokens, and SSH keys.

Flags vulnerabilities inline with diagnostic underlines and provides mitigation advice via the Problems panel.

9. 🔍 Smart Hover Tooltip Provider
Hover over complex syntax—such as regular expressions—to view inline interactive markdown cards breaking down pattern logic.

10. 🏗️ Automated Boilerplates, JSDoc & Unit Tests
Scaffolding: QuickPick templates for production Express REST servers, multi-stage Dockerfiles, Mongoose schemas, and Tailwind templates.

JSDoc Injection: Auto-generate complete docstrings with @param and @returns tags.

Unit Test Suite: Auto-generate isolated test cases utilizing native assert or Jest frameworks.

<div align="center">

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/prashant-kumar.dev-refactor-ai?style=for-the-badge&logo=visualstudiocode&logoColor=white&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=prashant-kumar.dev-refactor-ai)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/prashant-kumar.dev-refactor-ai?style=for-the-badge&color=success)](https://marketplace.visualstudio.com/items?itemName=prashant-kumar.dev-refactor-ai)
[![Visual Studio Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/prashant-kumar.dev-refactor-ai?style=for-the-badge&color=yellow)](https://marketplace.visualstudio.com/items?itemName=prashant-kumar.dev-refactor-ai)
[![Powered by Gemini](https://img.shields.io/badge/Powered%20By-Google%20Gemini%20API-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

> **Next-generation, commercial-grade AI pair programmer directly integrated into Visual Studio Code.**  
> Powered by the lightning-fast Google Gemini Flash API, offering seamless real-time completions, inline cursor edits, automated security auditing, split diff reviews, resilient fallback routing, and smart developer workflows.

---

### 📦 Instant Install via VS Code Terminal

```bash
code --install-extension prashant-kumar.dev-refactor-ai
