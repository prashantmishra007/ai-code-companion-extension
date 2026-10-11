import * as vscode from 'vscode';

// Live cloud backend URL hosted on Render
const API_BASE = 'https://ai-copilot-backend-oskz.onrender.com';

export function activate(context: vscode.ExtensionContext) {
  const provider = new AICopilotViewProvider(context.extensionUri);

  const viewIds = [
    'ai-assistant.view',
    'ai-assistant-sidebar',
    'ai-companion-sidebar',
    'ai-copilot-view',
    'aiAssistantView',
    'ai-workspace-companion',
    'dev-refactor-ai.sidebar'
  ];

  viewIds.forEach(id => {
    try {
      context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(id, provider, {
          webviewOptions: { retainContextWhenHidden: true }
        })
      );
    } catch {}
  });

  // 1. Generate Fresh Code Handler
  const executeGenerateCode = async (userPrompt?: string) => {
    const editor = vscode.window.activeTextEditor;
    const language = editor ? editor.document.languageId : 'javascript';

    // If no prompt passed from sidebar, open an input box prompt at the top
    let promptText = userPrompt;
    if (!promptText) {
      promptText = await vscode.window.showInputBox({
        title: 'Generate Fresh Code with Gemini',
        prompt: 'Describe what you want Gemini to write (e.g., "Create a debounce function in TypeScript")',
        placeHolder: 'Type your requirements here...'
      });
    }

    if (!promptText || promptText.trim() === '') {
      return;
    }

    provider.setLoading(true, 'Generating custom code with Gemini...');

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Gemini is generating your code...',
        cancellable: false
      },
      async () => {
        try {
          const response = await fetch(`${API_BASE}/api/generate-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: promptText,
              language: language
            })
          });

          if (!response.ok) {
            const errData = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(errData.error || `HTTP ${response.status}`);
          }

          const result = (await response.json()) as { code?: string; explanation?: string };

          if (result.code) {
            if (editor) {
              await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, result.code + '\n');
              });
            } else {
              const doc = await vscode.workspace.openTextDocument({
                content: result.code,
                language: language
              });
              await vscode.window.showTextDocument(doc);
            }

            provider.updateSummary(
              `Generated Code:\n\n${result.code}`,
              result.explanation || 'Code successfully generated and placed into your editor.'
            );
            vscode.window.showInformationMessage('Code generated and inserted successfully!');
          } else {
            throw new Error('No code received from the generator.');
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Generation failed: ${err.message || err}`);
          provider.updateSummary(`Generation error: ${err.message || err}`);
        } finally {
          provider.setLoading(false);
        }
      }
    );
  };

  // 2. Fix & Refactor Handler
  const executeFixCode = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Please open a file to fix or refactor code.');
      return;
    }

    const selection = editor.selection;
    const text = selection.isEmpty
      ? editor.document.getText()
      : editor.document.getText(selection);

    if (!text || text.trim() === '') {
      vscode.window.showWarningMessage('Please select some code to fix.');
      return;
    }

    provider.setLoading(true, 'Refactoring code with Gemini...');

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Gemini is refactoring your code...',
        cancellable: false
      },
      async () => {
        try {
          const response = await fetch(`${API_BASE}/api/fix-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: text,
              language: editor.document.languageId
            })
          });

          if (!response.ok) {
            const errData = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(errData.error || `HTTP ${response.status}`);
          }

          const result = (await response.json()) as { fixedCode?: string; explanation?: string };

          if (result.fixedCode) {
            await editor.edit(editBuilder => {
              if (selection.isEmpty) {
                const fullRange = new vscode.Range(
                  editor.document.positionAt(0),
                  editor.document.positionAt(editor.document.getText().length)
                );
                editBuilder.replace(fullRange, result.fixedCode!);
              } else {
                editBuilder.replace(selection, result.fixedCode!);
              }
            });

            vscode.window.showInformationMessage(
              `Fixed! ${result.explanation || 'Code optimized and repaired successfully.'}`
            );
          } else {
            throw new Error('No refactored code returned.');
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`AI Fix failed: ${err.message || err}`);
        } finally {
          provider.setLoading(false);
        }
      }
    );
  };

  // 3. Summarize Handler
  const executeSummarizeCode = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Please open a file to summarize.');
      return;
    }

    const selection = editor.selection;
    const text = selection.isEmpty
      ? editor.document.getText()
      : editor.document.getText(selection);

    if (!text || text.trim() === '') {
      vscode.window.showWarningMessage('No code to summarize.');
      return;
    }

    provider.setLoading(true, 'Generating code summary...');

    try {
      const response = await fetch(`${API_BASE}/api/summarize-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: text,
          language: editor.document.languageId
        })
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = (await response.json()) as { summary?: string; suggestions?: string };
      provider.updateSummary(result.summary || 'No summary generated.', result.suggestions);
    } catch (err: any) {
      vscode.window.showErrorMessage(`AI Summarize failed: ${err.message || err}`);
      provider.updateSummary(`Summary error: ${err.message || err}`);
    } finally {
      provider.setLoading(false);
    }
  };

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.generateCode', () => executeGenerateCode()),
    vscode.commands.registerCommand('ai-companion.fixCode', executeFixCode),
    vscode.commands.registerCommand('ai-companion.summarizeCode', executeSummarizeCode)
  );

  // Link Webview button actions
  provider.onGenerateRequested(prompt => executeGenerateCode(prompt));
  provider.onFixRequested(executeFixCode);
  provider.onSummarizeRequested(executeSummarizeCode);
}

class AICopilotViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _generateCallback?: (prompt: string) => Promise<void>;
  private _fixCallback?: () => Promise<void>;
  private _summarizeCallback?: () => Promise<void>;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public onGenerateRequested(fn: (prompt: string) => Promise<void>) {
    this._generateCallback = fn;
  }

  public onFixRequested(fn: () => Promise<void>) {
    this._fixCallback = fn;
  }

  public onSummarizeRequested(fn: () => Promise<void>) {
    this._summarizeCallback = fn;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'generateCode':
          if (this._generateCallback) await this._generateCallback(data.prompt);
          break;
        case 'fixCode':
          if (this._fixCallback) await this._fixCallback();
          break;
        case 'summarizeCode':
          if (this._summarizeCallback) await this._summarizeCallback();
          break;
      }
    });
  }

  public updateSummary(summary: string, suggestions?: string) {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateSummary',
        summary,
        suggestions
      });
    }
  }

  public setLoading(isLoading: boolean, statusText: string = 'Processing...') {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'setLoading',
        isLoading,
        statusText
      });
    }
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg-color: var(--vscode-sideBar-background, #1e1e1e);
      --text-color: var(--vscode-sideBar-foreground, #cccccc);
      --btn-bg: #007acc;
      --btn-hover: #0062a3;
      --card-bg: rgba(255, 255, 255, 0.04);
      --border-color: var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 13px;
      margin: 0;
      padding: 14px;
      box-sizing: border-box;
      user-select: none;
    }

    .header-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-bottom: 14px;
    }

    .avatar-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #0e639c;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }

    .header-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .title {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-editor-foreground, #ffffff);
    }

    .badge-status {
      font-size: 10px;
      color: #4ec9b0;
      font-weight: 600;
    }

    .prompt-box {
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    textarea {
      width: 100%;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--border-color);
      color: var(--text-color);
      padding: 8px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 12px;
      resize: vertical;
      min-height: 55px;
    }

    textarea:focus {
      outline: 1px solid var(--btn-bg);
    }

    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 14px;
    }

    button {
      background: var(--btn-bg);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 9px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      width: 100%;
      transition: background 0.15s ease;
    }

    button.primary-generate {
      background: #2e7d32;
    }

    button.primary-generate:hover:not(:disabled) {
      background: #1b5e20;
    }

    button:hover:not(:disabled) {
      background: var(--btn-hover);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      color: var(--vscode-sideBarTitle-foreground, #aaaaaa);
    }

    .summary-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      font-size: 12px;
      line-height: 1.4;
      max-height: 280px;
      overflow-y: auto;
      user-select: text;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .empty-state {
      opacity: 0.6;
      font-style: italic;
    }

    .suggestions-block {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid var(--border-color);
      color: #dcdcaa;
    }
  </style>
</head>
<body>
  <div class="header-card">
    <div class="avatar-icon">AI</div>
    <div class="header-info">
      <span class="title">AI Workspace Companion</span>
      <span class="badge-status">Cloud Engine 24/7 Active</span>
    </div>
  </div>

  <div class="prompt-box">
    <div class="section-title">Prompt Gemini For Code</div>
    <textarea id="promptInput" placeholder="e.g. Write a function to validate an email address..."></textarea>
    <button id="generateBtn" class="primary-generate">
      <span>✨</span>
      <span>Generate Fresh Code</span>
    </button>
  </div>

  <div class="btn-group">
    <button id="fixBtn">
      <span>⚡</span>
      <span>Fix & Refactor Selection (Ctrl+Alt+F)</span>
    </button>
    <button id="summarizeBtn">
      <span>📑</span>
      <span>Summarize File / Selection</span>
    </button>
  </div>

  <div class="section-title">AI Analysis / Generated Output</div>
  <div class="summary-card" id="summaryContainer">
    <div class="empty-state">Type a prompt above to generate code, or highlight existing code to fix/summarize.</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const generateBtn = document.getElementById('generateBtn');
    const fixBtn = document.getElementById('fixBtn');
    const summarizeBtn = document.getElementById('summarizeBtn');
    const promptInput = document.getElementById('promptInput');
    const summaryContainer = document.getElementById('summaryContainer');

    generateBtn.addEventListener('click', () => {
      const text = promptInput.value.trim();
      if (text) {
        vscode.postMessage({ type: 'generateCode', prompt: text });
      }
    });

    fixBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'fixCode' });
    });

    summarizeBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'summarizeCode' });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'setLoading':
          generateBtn.disabled = message.isLoading;
          fixBtn.disabled = message.isLoading;
          summarizeBtn.disabled = message.isLoading;
          if (message.isLoading) {
            summaryContainer.innerHTML = '<span style="opacity: 0.8;">⏳ ' + (message.statusText || 'Working...') + '</span>';
          }
          break;

        case 'updateSummary':
          let content = message.summary || '';
          if (message.suggestions) {
            content += '\\n\\n<div class="suggestions-block">💡 <strong>Details:</strong> ' + message.suggestions + '</div>';
          }
          summaryContainer.innerHTML = content;
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}

export function deactivate() {}