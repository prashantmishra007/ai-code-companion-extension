# 🚀 Gemini AI Code Companion (Dev Refactor AI)

[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://marketplace.visualstudio.com/)
[![Powered by Gemini](https://img.shields.io/badge/Powered%20By-Google%20Gemini%20API-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-0.0.2-blue?style=for-the-badge)](https://github.com/prashantmishra007/ai-code-companion-extension)

> **Next-generation, commercial-grade AI pair programmer directly integrated into Visual Studio Code.**  
> Powered by the lightning-fast Google Gemini Flash API, offering seamless real-time completions, inline cursor edits, security auditing, split diff reviews, and smart devops workflows.

---

## 🌟 Key Features Showcase

### 1. ⚡ Ghost-Text Inline Autocomplete
* Low-latency GitHub Copilot-style inline code suggestions in gray text as you type.
* Accept suggestions instantly with `Tab` or toggle suggestions on/off using `Alt + \`.

### 2. 💬 Interactive Sidebar Chat Assistant
* Sleek glassmorphism UI embedded in the VS Code Activity Bar.
* One-click action triggers: **Fix & Refactor**, **Explain Code**, and custom conversational debugging.

### 3. ✍️ Comment-to-Code Generation
* Simply write a comment (e.g. `// function to find factorial of a number`) and watch Gemini synthesize idiomatic, fully functional implementations automatically.

### 4. 🎯 Floating Inline Edit (`Ctrl + I`)
* Select any block of code and press `Ctrl + I` to trigger an in-place floating input.
* Prompt natural language instructions (e.g., *"Convert to async/await"*, *"Add input validation"*) without leaving the editor canvas.

### 5. 🔀 Native Split Diff Viewer
* Review all AI-generated code transformations side-by-side (`Original ↔ Gemini Edit`) before committing changes to your workspace.

### 6. 🛠️ Terminal Error Auto-Fixer
* Automatically diagnose complex shell, runtime, or package manager errors (such as `npm ERR! ERESOLVE`).
* Provides instant root-cause breakdowns and ready-to-run copyable terminal commands.

### 7. ✨ AI Git Commit Message Generator
* Directly integrated into the VS Code Source Control panel title bar (`✨` icon).
* Automatically reads staged changes (`git diff --cached`) and crafts conventional semantic commit messages (e.g., `feat: ...`, `fix: ...`).

### 8. 🛡️ Real-Time Security & Secret Scanner
* Audits files on save for exposed credentials, Google API keys, database connection strings, JWT tokens, and SSH keys.
* Flags vulnerabilities inline with diagnostic underlines and provides mitigation advice via the Problems panel.

### 9. 🔍 Smart Hover Tooltip Provider
* Hover over complex syntax—such as regular expressions—to view inline interactive markdown cards breaking down pattern logic.

### 10. 🏗️ Automated Boilerplates, JSDoc & Unit Tests
* **Scaffolding:** QuickPick templates for production Express REST servers, multi-stage Dockerfiles, Mongoose schemas, and Tailwind templates.
* **JSDoc Injection:** Auto-generate complete docstrings with `@param` and `@returns` tags.
* **Unit Test Suite:** Auto-generate isolated test cases utilizing native `assert` or Jest frameworks.

---

## ⌨️ Keyboard Shortcuts & Quick Reference

| Action | Shortcut / Trigger | Description |
|---|---|---|
| **Inline Edit** | `Ctrl + I` | Floating prompt to edit selected code |
| **Accept Ghost Text** | `Tab` | Accept current inline suggestion |
| **Toggle Suggestion** | `Alt + \` | Manually trigger or toggle autocomplete |
| **Command Palette** | `Ctrl + Shift + P` | Search any `Gemini: ...` command |
| **AI Commit Message** | Click `✨` in Source Control | Generates conventional commit message |
| **Open Problems** | `Ctrl + Shift + M` | View Security & Secret Scanner warnings |

---

## 🛠️ Architecture & Tech Stack

* **Core Engine:** VS Code Extension API (`vscode`)
* **AI Model:** Google Gemini API (via `@google/genai` / REST)
* **Language:** TypeScript, Node.js
* **Build Tools:** `tsc`, `@vscode/vsce`

---

## 📦 Getting Started & Setup

### Prerequisites
* [Node.js](https://nodejs.org/) (v18.x or later)
* [Visual Studio Code](https://code.visualstudio.com/) (v1.85.0 or later)
* A valid [Google Gemini API Key](https://aistudio.google.com/)

### Installation & Local Run

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/prashantmishra007/ai-code-companion-extension.git](https://github.com/prashantmishra007/ai-code-companion-extension.git)
   cd ai-code-companion-extension