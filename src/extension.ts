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

            provider.updateSummary(
              'Code refactored and updated successfully.',
              result.explanation || 'Optimized code syntax and structure.'
            );

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
      --bg-color: var(--vscode-sideBar-background, #181a1f);
      --text-color: var(--vscode-sideBar-foreground, #dcdcdc);
      --primary-gemini: linear-gradient(135deg, #4285f4 0%, #9b72cf 50%, #d96570 100%);
      --glass-bg: rgba(255, 255, 255, 0.04);
      --glass-border: rgba(255, 255, 255, 0.08);
      --card-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      font-size: 13px;
      margin: 0;
      padding: 14px;
      user-select: none;
      overflow-x: hidden;
    }

    .header-card {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: linear-gradient(145deg, rgba(32, 38, 52, 0.7), rgba(18, 21, 28, 0.8));
      backdrop-filter: blur(12px);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      box-shadow: var(--card-shadow);
      margin-bottom: 16px;
    }

    .avatar-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: var(--primary-gemini);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 15px;
      box-shadow: 0 4px 15px rgba(155, 114, 207, 0.45);
      flex-shrink: 0;
    }

    .header-info { display: flex; flex-direction: column; gap: 3px; }
    .title { font-weight: 700; font-size: 13px; letter-spacing: 0.3px; color: #ffffff; }

    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 600;
      color: #4ec9b0;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #4ec9b0;
      box-shadow: 0 0 8px #4ec9b0;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
      color: #8b949e;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .prompt-box-wrapper {
      position: relative;
      margin-bottom: 16px;
      background: linear-gradient(145deg, rgba(25, 29, 39, 0.9), rgba(15, 17, 23, 0.95));
      border-radius: 12px;
      padding: 10px;
      border: 1px solid var(--glass-border);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45), inset 0 2px 4px rgba(0, 0, 0, 0.5);
      transition: all 0.3s ease;
    }

    .prompt-box-wrapper:focus-within {
      border-color: #9b72cf;
      box-shadow: 0 0 20px rgba(155, 114, 207, 0.35), inset 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    textarea {
      width: 100%;
      background: transparent;
      border: none;
      color: #ffffff;
      padding: 4px;
      font-family: inherit;
      font-size: 12.5px;
      resize: vertical;
      min-height: 65px;
      outline: none;
      line-height: 1.45;
    }

    textarea::placeholder {
      color: rgba(255, 255, 255, 0.35);
      font-style: italic;
    }

    .btn-3d {
      border: none;
      border-radius: 9px;
      padding: 10px 14px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      position: relative;
      transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.15s ease;
      user-select: none;
    }

    .btn-generate {
      background: linear-gradient(135deg, #1f883d 0%, #106027 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(31, 136, 61, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 0 rgba(0, 0, 0, 0.3);
      margin-top: 8px;
    }

    .btn-generate:hover:not(:disabled) {
      filter: brightness(1.15);
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(31, 136, 61, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }

    .btn-3d:active:not(:disabled) {
      transform: translateY(2px) !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5), inset 0 2px 4px rgba(0, 0, 0, 0.4) !important;
    }

    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
    }

    .btn-action {
      background: linear-gradient(145deg, #1f6feb 0%, #0d419d 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(31, 111, 235, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 0 rgba(0, 0, 0, 0.25);
    }

    .btn-action:hover:not(:disabled) {
      filter: brightness(1.12);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: linear-gradient(145deg, #2d333b 0%, #22272e 100%);
      color: #cdd9e5;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    .btn-secondary:hover:not(:disabled) {
      background: linear-gradient(145deg, #373e47 0%, #282e37 100%);
      transform: translateY(-1px);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      filter: grayscale(0.5);
    }

    .summary-card {
      background: linear-gradient(145deg, rgba(20, 24, 33, 0.8), rgba(12, 14, 20, 0.9));
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 14px;
      font-size: 12px;
      line-height: 1.55;
      max-height: 290px;
      overflow-y: auto;
      user-select: text;
      word-break: break-word;
      white-space: pre-wrap;
      box-shadow: var(--card-shadow);
    }

    .empty-state {
      opacity: 0.55;
      font-style: italic;
      text-align: center;
      padding: 12px 4px;
    }

    .gemini-shimmer-box {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 6px 0;
    }

    .shimmer-line {
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.05) 0%,
        rgba(66, 133, 244, 0.25) 25%,
        rgba(155, 114, 207, 0.35) 50%,
        rgba(217, 101, 112, 0.25) 75%,
        rgba(255, 255, 255, 0.05) 100%
      );
      background-size: 300% 100%;
      animation: waveShimmer 2s infinite ease-in-out;
    }

    .shimmer-line.short { width: 65%; }
    .shimmer-line.medium { width: 85%; }

    @keyframes waveShimmer {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }

    .suggestions-block {
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(220, 220, 170, 0.08);
      border-left: 3px solid #dcdcaa;
      color: #e5e5b8;
    }
  </style>
</head>
<body>
  <div class="header-card">
    <div class="avatar-icon">✨</div>
    <div class="header-info">
      <span class="title">AI Companion</span>
      <span class="badge-status">
        <span class="status-dot"></span>
        Gemini 24/7 Engine
      </span>
    </div>
  </div>

  <div class="section-title">💬 Prompt AI for Code</div>
  <div class="prompt-box-wrapper">
    <textarea id="promptInput" placeholder="Jaise: Write a function to check palindrome in JS, ya Hinglish me type karein..."></textarea>
    <button id="generateBtn" class="btn-3d btn-generate">
      <span>✨</span>
      <span>Generate Fresh Code</span>
    </button>
  </div>

  <div class="btn-group">
    <button id="fixBtn" class="btn-3d btn-action">
      <span>⚡</span>
      <span>Fix & Refactor (Ctrl+Alt+F)</span>
    </button>
    <button id="summarizeBtn" class="btn-3d btn-secondary">
      <span>📑</span>
      <span>Summarize Selection</span>
    </button>
  </div>

  <div class="section-title">📊 Live Output</div>
  <div class="summary-card" id="summaryContainer">
    <div class="empty-state">Upar prompt likhein ya code select karke Fix / Summarize par click karein.</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const generateBtn = document.getElementById('generateBtn');
    const fixBtn = document.getElementById('fixBtn');
    const summarizeBtn = document.getElementById('summarizeBtn');
    const promptInput = document.getElementById('promptInput');
    const summaryContainer = document.getElementById('summaryContainer');

    // Shared AudioContext for browser autoplay unlocking
    let audioCtx = null;

    function unlockAudioContext() {
      try {
        const AudioClass = window.AudioContext || window.webkitAudioContext;
        if (!audioCtx && AudioClass) {
          audioCtx = new AudioClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      } catch (e) {
        console.warn('Unlock audio failed', e);
      }
    }

    // Play clean two-tone chime bell sound
    function playNotificationSound() {
      try {
        unlockAudioContext();
        if (!audioCtx) return;

        const now = audioCtx.currentTime;

        // Note 1: Clear Ding (880Hz - A5)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.28);

        // Note 2: Harmonious Chime (1320Hz - E6)
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, now + 0.12);
        gain2.gain.setValueAtTime(0.28, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.45);
      } catch (err) {
        console.warn('Audio playback error:', err);
      }
    }

    // Unlock audio instantly when user clicks any action
    generateBtn.addEventListener('click', () => {
      unlockAudioContext();
      const text = promptInput.value.trim();
      if (text) {
        vscode.postMessage({ type: 'generateCode', prompt: text });
      }
    });

    fixBtn.addEventListener('click', () => {
      unlockAudioContext();
      vscode.postMessage({ type: 'fixCode' });
    });

    summarizeBtn.addEventListener('click', () => {
      unlockAudioContext();
      vscode.postMessage({ type: 'summarizeCode' });
    });

    promptInput.addEventListener('focus', () => {
      unlockAudioContext();
    });

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'setLoading':
          generateBtn.disabled = message.isLoading;
          fixBtn.disabled = message.isLoading;
          summarizeBtn.disabled = message.isLoading;
          if (message.isLoading) {
            summaryContainer.innerHTML =
              '<div class="gemini-shimmer-box">' +
                '<span style="font-size: 11px; opacity: 0.85; font-weight: 600;">✨ ' + (message.statusText || 'Gemini is processing...') + '</span>' +
                '<div class="shimmer-line"></div>' +
                '<div class="shimmer-line medium"></div>' +
                '<div class="shimmer-line short"></div>' +
              '</div>';
          }
          break;

        case 'updateSummary':
          playNotificationSound();

          let content = message.summary || '';
          if (message.suggestions) {
            content += '<div class="suggestions-block">💡 <strong>Details:</strong> ' + message.suggestions + '</div>';
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