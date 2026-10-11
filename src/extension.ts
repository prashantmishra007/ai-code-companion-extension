import * as vscode from 'vscode';

// Live cloud backend URL hosted on Render
const API_BASE = 'https://ai-copilot-backend-oskz.onrender.com';

export function activate(context: vscode.ExtensionContext) {
  const provider = new AICopilotViewProvider(context.extensionUri);

  // Register the Webview View Provider across common view ID aliases to ensure immediate attachment
  const viewIds = [
    'ai-companion-sidebar',
    'ai-copilot-view',
    'aiAssistantView',
    'ai-workspace-companion',
    'ai-assistant-sidebar',
    'dev-refactor-ai.sidebar'
  ];

  viewIds.forEach(id => {
    try {
      context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(id, provider, {
          webviewOptions: { retainContextWhenHidden: true }
        })
      );
    } catch {
      // Ignored if ID is not declared in package.json
    }
  });

  // Handler for Fix & Refactor
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
            throw new Error('No refactored code returned by the engine.');
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`AI Fix failed: ${err.message || err}`);
        } finally {
          provider.setLoading(false);
        }
      }
    );
  };

  // Handler for Summarize
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

  // Register command aliases so Ctrl+Alt+F and command palette actions work immediately
  const fixCommandIds = [
    'ai-companion.fixCode',
    'ai-copilot.fixCode',
    'extension.fixCode',
    'dev-refactor-ai.fixCode'
  ];

  const summarizeCommandIds = [
    'ai-companion.summarizeCode',
    'ai-copilot.summarizeCode',
    'extension.summarizeCode',
    'dev-refactor-ai.summarizeCode'
  ];

  fixCommandIds.forEach(cmd => {
    try {
      context.subscriptions.push(vscode.commands.registerCommand(cmd, executeFixCode));
    } catch {}
  });

  summarizeCommandIds.forEach(cmd => {
    try {
      context.subscriptions.push(vscode.commands.registerCommand(cmd, executeSummarizeCode));
    } catch {}
  });

  // Connect Webview button messages to handlers
  provider.onFixRequested(executeFixCode);
  provider.onSummarizeRequested(executeSummarizeCode);
}

class AICopilotViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _fixCallback?: () => Promise<void>;
  private _summarizeCallback?: () => Promise<void>;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public onFixRequested(fn: () => Promise<void>) {
    this._fixCallback = fn;
  }

  public onSummarizeRequested(fn: () => Promise<void>) {
    this._summarizeCallback = fn;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
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
      margin-bottom: 16px;
    }

    .avatar-icon {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #0e639c;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
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

    .model-name {
      font-size: 11px;
      opacity: 0.8;
    }

    .badge-status {
      display: inline-block;
      font-size: 10px;
      color: #4ec9b0;
      font-weight: 600;
    }

    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    button {
      background: var(--btn-bg);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      transition: background 0.15s ease, opacity 0.15s ease;
      width: 100%;
      text-align: left;
    }

    button:hover:not(:disabled) {
      background: var(--btn-hover);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      color: var(--vscode-sideBarTitle-foreground, #aaaaaa);
    }

    .summary-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.5;
      max-height: 380px;
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
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--border-color);
      font-weight: 500;
      color: #dcdcaa;
    }
  </style>
</head>
<body>
  <div class="header-card">
    <div class="avatar-icon">AI</div>
    <div class="header-info">
      <span class="title">AI Workspace Companion</span>
      <span class="model-name">Gemini Cloud Engine</span>
      <span class="badge-status">Active</span>
    </div>
  </div>

  <div class="btn-group">
    <button id="summarizeBtn">
      <span>📑</span>
      <span>Summarize File / Selection</span>
    </button>
    <button id="fixBtn">
      <span>⚡</span>
      <span>Fix & Refactor Selected Code (Ctrl+Alt+F)</span>
    </button>
  </div>

  <div class="section-title">Code Summary</div>
  <div class="summary-card" id="summaryContainer">
    <div class="empty-state">Highlight code and click Summarize or Fix to inspect AI analysis.</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const fixBtn = document.getElementById('fixBtn');
    const summarizeBtn = document.getElementById('summarizeBtn');
    const summaryContainer = document.getElementById('summaryContainer');

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
          fixBtn.disabled = message.isLoading;
          summarizeBtn.disabled = message.isLoading;
          if (message.isLoading) {
            summaryContainer.innerHTML = '<span style="opacity: 0.8;">⏳ ' + (message.statusText || 'Working...') + '</span>';
          }
          break;

        case 'updateSummary':
          let content = message.summary || '';
          if (message.suggestions) {
            content += '\\n\\n<div class="suggestions-block">💡 <strong>Tips:</strong> ' + message.suggestions + '</div>';
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