import * as vscode from 'vscode';

const API_BASE = 'https://ai-copilot-backend-oskz.onrender.com';

export function activate(context: vscode.ExtensionContext) {
  const provider = new AICopilotChatProvider(context.extensionUri);

  // 1. Sidebar Webview View Registration
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

  // 2. Status Bar Badge (Gemini Active Indicator)
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(sparkle) Gemini: Active';
  statusBarItem.tooltip = 'Gemini Inline AI Completions Active (Press Tab to Accept)';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 3. Inline Ghost Text Provider (Copilot Style)
  const inlineCompletionProvider = new GeminiInlineCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      inlineCompletionProvider
    )
  );

  // 4. Editor me code insert karne ka handler
  provider.onInsertCode(async (code: string) => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, code + '\n');
      });
      vscode.window.showInformationMessage('Code inserted into editor!');
    } else {
      const doc = await vscode.workspace.openTextDocument({
        content: code,
        language: 'javascript'
      });
      await vscode.window.showTextDocument(doc);
    }
  });

  // 5. Quick Action: Fix selection
  const executeFixCode = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Please open a file to fix code.');
      return;
    }
    const selection = editor.selection;
    const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
    if (!text.trim()) {
      vscode.window.showWarningMessage('Please select some code to fix.');
      return;
    }

    provider.sendUserMessageToChat('Fix and refactor this code:\n```\n' + text + '\n```');
  };

  // 6. Quick Action: Explain selection
  const executeExplainCode = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Please open a file to explain code.');
      return;
    }
    const selection = editor.selection;
    const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
    if (!text.trim()) {
      vscode.window.showWarningMessage('Please select some code to explain.');
      return;
    }

    provider.sendUserMessageToChat('Explain this code step-by-step and suggest optimizations:\n```\n' + text + '\n```');
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.fixCode', executeFixCode),
    vscode.commands.registerCommand('ai-companion.explainCode', executeExplainCode)
  );

  provider.onFixRequested(executeFixCode);
  provider.onExplainRequested(executeExplainCode);
}

/**
 * Inline Completion Provider for Copilot-style ghost text
 */
class GeminiInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (token.isCancellationRequested) return undefined;

    const lineText = document.lineAt(position.line).text;
    const linePrefix = lineText.substring(0, position.character);

    // Skip if line prefix is empty or only whitespace
    if (!linePrefix.trim()) {
      return undefined;
    }

    // Capture surrounding context (last 25 lines)
    const startLine = Math.max(0, position.line - 25);
    const prefixRange = new vscode.Range(startLine, 0, position.line, position.character);
    const prefixCode = document.getText(prefixRange);

    // Debounce: Wait 450ms to let user stop typing before requesting API
    await new Promise(resolve => setTimeout(resolve, 450));
    if (token.isCancellationRequested) return undefined;

    try {
      const prompt = `You are a high-speed inline code autocomplete engine like GitHub Copilot.
Given this ${document.languageId} code context, complete the code immediately following the cursor.
Return ONLY the raw completion code text to append.
DO NOT use markdown code blocks (\`\`\`), DO NOT add explanations, and DO NOT repeat the prefix text.

Code context before cursor:
${prefixCode}`;

      const response = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          history: []
        })
      });

      if (!response.ok || token.isCancellationRequested) return undefined;

      const data = (await response.json()) as { reply?: string };
      let completion = data.reply || '';

      // Strip any accidental markdown formatting
      completion = completion
        .replace(/^```[a-zA-Z]*\n?/, '')
        .replace(/\n?```$/, '')
        .trimEnd();

      if (!completion || token.isCancellationRequested) return undefined;

      const item = new vscode.InlineCompletionItem(
        completion,
        new vscode.Range(position, position)
      );

      return [item];
    } catch {
      return undefined;
    }
  }
}

/**
 * Webview Chat View Provider (Gemini White Aesthetic)
 */
class AICopilotChatProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _history: Array<{ role: 'user' | 'model'; text: string }> = [];
  private _insertCallback?: (code: string) => Promise<void>;
  private _fixCallback?: () => Promise<void>;
  private _explainCallback?: () => Promise<void>;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public onInsertCode(fn: (code: string) => Promise<void>) {
    this._insertCallback = fn;
  }

  public onFixRequested(fn: () => Promise<void>) {
    this._fixCallback = fn;
  }

  public onExplainRequested(fn: () => Promise<void>) {
    this._explainCallback = fn;
  }

  public sendUserMessageToChat(text: string) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'triggerChat', text: text });
    }
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
        case 'sendMessage':
          await this._handleChatMessage(data.text);
          break;
        case 'insertCode':
          if (this._insertCallback) {
            const cb = this._insertCallback;
            await cb(data.code);
          }
          break;
        case 'clearHistory':
          this._history = [];
          break;
        case 'triggerFix':
          if (this._fixCallback) {
            const cb = this._fixCallback;
            await cb();
          }
          break;
        case 'triggerExplain':
          if (this._explainCallback) {
            const cb = this._explainCallback;
            await cb();
          }
          break;
      }
    });
  }

  private async _handleChatMessage(userMessage: string) {
    if (!this._view) return;

    this._view.webview.postMessage({ type: 'setLoading', isLoading: true });

    try {
      const response = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: this._history
        })
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || ('HTTP ' + response.status));
      }

      const result = (await response.json()) as { reply: string };

      this._history.push({ role: 'user', text: userMessage });
      this._history.push({ role: 'model', text: result.reply });

      this._view.webview.postMessage({
        type: 'botResponse',
        reply: result.reply
      });
    } catch (err: any) {
      this._view.webview.postMessage({
        type: 'botError',
        error: err.message || 'Failed to get response.'
      });
    } finally {
      this._view.webview.postMessage({ type: 'setLoading', isLoading: false });
    }
  }

  private _getHtmlForWebview(): string {
    return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <style>' +
'    :root {' +
'      --bg-color: #f0f4f9;' +
'      --card-bg: #ffffff;' +
'      --text-color: #1f2937;' +
'      --subtext-color: #5f6368;' +
'      --primary-gemini: linear-gradient(135deg, #1a73e8 0%, #8ab4f8 50%, #7b1fa2 100%);' +
'      --border-color: #e2e8f0;' +
'      --card-shadow: 0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);' +
'    }' +
'    * { box-sizing: border-box; }' +
'    body {' +
'      background-color: var(--bg-color);' +
'      color: var(--text-color);' +
'      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);' +
'      font-size: 13px;' +
'      margin: 0;' +
'      padding: 0;' +
'      display: flex;' +
'      flex-direction: column;' +
'      height: 100vh;' +
'      overflow: hidden;' +
'    }' +
'    .chat-header {' +
'      padding: 12px 14px;' +
'      background: #ffffff;' +
'      border-bottom: 1px solid var(--border-color);' +
'      display: flex;' +
'      align-items: center;' +
'      justify-content: space-between;' +
'      flex-shrink: 0;' +
'      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);' +
'    }' +
'    .header-left {' +
'      display: flex;' +
'      align-items: center;' +
'      gap: 10px;' +
'    }' +
'    .avatar-icon {' +
'      width: 32px;' +
'      height: 32px;' +
'      border-radius: 50%;' +
'      background: var(--primary-gemini);' +
'      color: #ffffff;' +
'      display: flex;' +
'      align-items: center;' +
'      justify-content: center;' +
'      font-weight: 800;' +
'      font-size: 14px;' +
'      box-shadow: 0 2px 8px rgba(26, 115, 232, 0.3);' +
'    }' +
'    .header-title {' +
'      font-weight: 700;' +
'      font-size: 13px;' +
'      color: #1e1f20;' +
'      display: block;' +
'    }' +
'    .status-text {' +
'      font-size: 10.5px;' +
'      color: #137333;' +
'      display: flex;' +
'      align-items: center;' +
'      gap: 5px;' +
'      font-weight: 600;' +
'    }' +
'    .status-dot {' +
'      width: 6px;' +
'      height: 6px;' +
'      border-radius: 50%;' +
'      background: #1e8e3e;' +
'      box-shadow: 0 0 6px #1e8e3e;' +
'      animation: pulse 2s infinite;' +
'    }' +
'    @keyframes pulse {' +
'      0%, 100% { opacity: 1; transform: scale(1); }' +
'      50% { opacity: 0.4; transform: scale(0.8); }' +
'    }' +
'    .clear-btn {' +
'      background: #fce8e6;' +
'      border: 1px solid #fad2cf;' +
'      color: #c5221f;' +
'      border-radius: 20px;' +
'      padding: 4px 10px;' +
'      font-size: 11px;' +
'      font-weight: 600;' +
'      cursor: pointer;' +
'      transition: all 0.2s ease;' +
'    }' +
'    .clear-btn:hover {' +
'      background: #fad2cf;' +
'    }' +
'    .quick-actions-bar {' +
'      display: grid;' +
'      grid-template-columns: 1fr 1fr;' +
'      gap: 8px;' +
'      padding: 10px 12px;' +
'      background: #f8fafd;' +
'      border-bottom: 1px solid var(--border-color);' +
'      flex-shrink: 0;' +
'    }' +
'    .btn-action-3d {' +
'      border: none;' +
'      border-radius: 8px;' +
'      padding: 8px 10px;' +
'      font-size: 12px;' +
'      font-weight: 700;' +
'      cursor: pointer;' +
'      display: flex;' +
'      align-items: center;' +
'      justify-content: center;' +
'      gap: 6px;' +
'      color: #ffffff;' +
'      transition: transform 0.1s ease, filter 0.15s ease, box-shadow 0.15s ease;' +
'      user-select: none;' +
'    }' +
'    .btn-fix {' +
'      background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);' +
'      box-shadow: 0 3px 10px rgba(26, 115, 232, 0.35);' +
'    }' +
'    .btn-explain {' +
'      background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);' +
'      box-shadow: 0 3px 10px rgba(13, 148, 136, 0.35);' +
'    }' +
'    .btn-action-3d:hover {' +
'      filter: brightness(1.1);' +
'      transform: translateY(-1px);' +
'    }' +
'    .btn-action-3d:active {' +
'      transform: translateY(1px);' +
'    }' +
'    .chat-messages {' +
'      flex: 1;' +
'      overflow-y: auto;' +
'      padding: 16px 12px;' +
'      display: flex;' +
'      flex-direction: column;' +
'      gap: 14px;' +
'    }' +
'    .message-row {' +
'      display: flex;' +
'      flex-direction: column;' +
'      max-width: 96%;' +
'    }' +
'    .message-row.user {' +
'      align-self: flex-end;' +
'      align-items: flex-end;' +
'    }' +
'    .message-row.bot {' +
'      align-self: flex-start;' +
'      align-items: flex-start;' +
'      width: 100%;' +
'    }' +
'    .bubble {' +
'      padding: 11px 15px;' +
'      border-radius: 14px;' +
'      line-height: 1.55;' +
'      font-size: 13px;' +
'      word-break: break-word;' +
'      user-select: text;' +
'    }' +
'    .bubble.user-msg {' +
'      background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);' +
'      color: #ffffff;' +
'      border-bottom-right-radius: 3px;' +
'      box-shadow: 0 3px 12px rgba(26, 115, 232, 0.25);' +
'      font-weight: 500;' +
'    }' +
'    .bubble.bot-msg {' +
'      background: #ffffff;' +
'      border: 1px solid var(--border-color);' +
'      border-bottom-left-radius: 3px;' +
'      box-shadow: var(--card-shadow);' +
'      color: #1f2937;' +
'      width: 100%;' +
'    }' +
'    .code-container {' +
'      margin: 10px 0;' +
'      border-radius: 10px;' +
'      overflow: hidden;' +
'      border: 1px solid #1e293b;' +
'      background: #111827;' +
'      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);' +
'    }' +
'    .code-header {' +
'      display: flex;' +
'      justify-content: space-between;' +
'      align-items: center;' +
'      padding: 6px 12px;' +
'      background: #1f2937;' +
'      border-bottom: 1px solid #374151;' +
'      font-size: 11px;' +
'      color: #93c5fd;' +
'      font-weight: 700;' +
'      text-transform: uppercase;' +
'    }' +
'    .code-header-actions {' +
'      display: flex;' +
'      gap: 6px;' +
'    }' +
'    .code-btn {' +
'      border: none;' +
'      padding: 4px 9px;' +
'      border-radius: 6px;' +
'      font-size: 11px;' +
'      font-weight: 700;' +
'      cursor: pointer;' +
'      transition: all 0.15s ease;' +
'    }' +
'    .code-btn-copy {' +
'      background: rgba(255, 255, 255, 0.12);' +
'      color: #f3f4f6;' +
'    }' +
'    .code-btn-copy:hover {' +
'      background: rgba(255, 255, 255, 0.22);' +
'    }' +
'    .code-btn-insert {' +
'      background: #10b981;' +
'      color: #ffffff;' +
'      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);' +
'    }' +
'    .code-btn-insert:hover {' +
'      background: #059669;' +
'      transform: scale(1.02);' +
'    }' +
'    pre {' +
'      margin: 0;' +
'      padding: 12px;' +
'      overflow-x: auto;' +
'      font-family: var(--vscode-editor-font-family, Consolas, "Fira Code", monospace);' +
'      font-size: 12.5px;' +
'      color: #e5e7eb;' +
'      line-height: 1.5;' +
'    }' +
'    .shimmer-box {' +
'      display: flex;' +
'      flex-direction: column;' +
'      gap: 9px;' +
'      padding: 8px 0;' +
'      width: 100%;' +
'      min-width: 220px;' +
'    }' +
'    .shimmer-line {' +
'      height: 12px;' +
'      border-radius: 6px;' +
'      background: linear-gradient(' +
'        90deg,' +
'        #e2e8f0 0%,' +
'        #dbeafe 25%,' +
'        #f3e8ff 50%,' +
'        #fee2e2 75%,' +
'        #e2e8f0 100%' +
'      );' +
'      background-size: 300% 100%;' +
'      animation: waveShimmer 2s infinite ease-in-out;' +
'    }' +
'    .shimmer-line.short { width: 55%; }' +
'    .shimmer-line.medium { width: 80%; }' +
'    @keyframes waveShimmer {' +
'      0% { background-position: 100% 0; }' +
'      100% { background-position: -100% 0; }' +
'    }' +
'    .chat-input-bar {' +
'      padding: 12px 14px;' +
'      background: #ffffff;' +
'      border-top: 1px solid var(--border-color);' +
'      display: flex;' +
'      flex-direction: column;' +
'      gap: 8px;' +
'      flex-shrink: 0;' +
'    }' +
'    .input-wrapper {' +
'      position: relative;' +
'      background: #f0f4f9;' +
'      border-radius: 20px;' +
'      border: 1px solid #d3e3fd;' +
'      padding: 8px 14px;' +
'      display: flex;' +
'      align-items: flex-end;' +
'      gap: 10px;' +
'      transition: all 0.25s ease;' +
'    }' +
'    .input-wrapper:focus-within {' +
'      background: #ffffff;' +
'      border-color: #1a73e8;' +
'      box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);' +
'    }' +
'    textarea {' +
'      flex: 1;' +
'      background: transparent;' +
'      border: none;' +
'      color: #1f2937;' +
'      font-family: inherit;' +
'      font-size: 13px;' +
'      resize: none;' +
'      height: 30px;' +
'      max-height: 120px;' +
'      outline: none;' +
'      line-height: 1.45;' +
'      padding: 4px 0;' +
'    }' +
'    textarea::placeholder { color: #80868b; }' +
'    .send-btn {' +
'      width: 32px;' +
'      height: 32px;' +
'      border-radius: 50%;' +
'      border: none;' +
'      background: #1a73e8;' +
'      color: #ffffff;' +
'      display: flex;' +
'      align-items: center;' +
'      justify-content: center;' +
'      font-size: 14px;' +
'      cursor: pointer;' +
'      transition: all 0.15s ease;' +
'      flex-shrink: 0;' +
'    }' +
'    .send-btn:hover:not(:disabled) {' +
'      background: #1557b0;' +
'      transform: scale(1.05);' +
'    }' +
'    .send-btn:disabled {' +
'      opacity: 0.4;' +
'      cursor: not-allowed;' +
'    }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="chat-header">' +
'    <div class="header-left">' +
'      <div class="avatar-icon">✨</div>' +
'      <div>' +
'        <span class="header-title">Gemini Assistant</span>' +
'        <span class="status-text"><span class="status-dot"></span>Active • Gemini 3.8 Flash</span>' +
'      </div>' +
'    </div>' +
'    <button class="clear-btn" id="clearBtn">Clear</button>' +
'  </div>' +
'  <div class="quick-actions-bar">' +
'    <button class="btn-action-3d btn-fix" id="chipFix"><span>⚡</span> Fix & Refactor</button>' +
'    <button class="btn-action-3d btn-explain" id="chipExplain"><span>📑</span> Explain Code</button>' +
'  </div>' +
'  <div class="chat-messages" id="messagesContainer">' +
'    <div class="message-row bot">' +
'      <div class="bubble bot-msg">' +
'        ✨ <strong>Namaste!</strong> Main aapka Gemini AI coding companion hoon.<br/>' +
'        Koi bhi question poochhein ya code select karke <strong>Fix</strong> aur <strong>Explain</strong> karein.' +
'      </div>' +
'    </div>' +
'  </div>' +
'  <div class="chat-input-bar">' +
'    <div class="input-wrapper">' +
'      <textarea id="chatInput" placeholder="Ask Gemini anything in English or Hinglish..."></textarea>' +
'      <button class="send-btn" id="sendBtn" title="Send message">➤</button>' +
'    </div>' +
'  </div>' +
'  <script>' +
'    const vscode = acquireVsCodeApi();' +
'    const messagesContainer = document.getElementById("messagesContainer");' +
'    const chatInput = document.getElementById("chatInput");' +
'    const sendBtn = document.getElementById("sendBtn");' +
'    const clearBtn = document.getElementById("clearBtn");' +
'    const chipFix = document.getElementById("chipFix");' +
'    const chipExplain = document.getElementById("chipExplain");' +
'    let audioCtx = null;' +
'    function unlockAudio() {' +
'      try {' +
'        const AudioClass = window.AudioContext || window.webkitAudioContext;' +
'        if (!audioCtx && AudioClass) { audioCtx = new AudioClass(); }' +
'        if (audioCtx && audioCtx.state === "suspended") { audioCtx.resume(); }' +
'      } catch (e) {}' +
'    }' +
'    function playChime() {' +
'      try {' +
'        unlockAudio();' +
'        if (!audioCtx) return;' +
'        const now = audioCtx.currentTime;' +
'        const osc1 = audioCtx.createOscillator();' +
'        const gain1 = audioCtx.createGain();' +
'        osc1.type = "sine";' +
'        osc1.frequency.setValueAtTime(880, now);' +
'        gain1.gain.setValueAtTime(0.3, now);' +
'        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);' +
'        osc1.connect(gain1);' +
'        gain1.connect(audioCtx.destination);' +
'        osc1.start(now);' +
'        osc1.stop(now + 0.28);' +
'        const osc2 = audioCtx.createOscillator();' +
'        const gain2 = audioCtx.createGain();' +
'        osc2.type = "sine";' +
'        osc2.frequency.setValueAtTime(1320, now + 0.12);' +
'        gain2.gain.setValueAtTime(0.32, now + 0.12);' +
'        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);' +
'        osc2.connect(gain2);' +
'        gain2.connect(audioCtx.destination);' +
'        osc2.start(now + 0.12);' +
'        osc2.stop(now + 0.45);' +
'      } catch (e) {}' +
'    }' +
'    function scrollToBottom() {' +
'      messagesContainer.scrollTop = messagesContainer.scrollHeight;' +
'    }' +
'    function parseMarkdownToElements(rawText) {' +
'      const wrapper = document.createElement("div");' +
'      const segments = rawText.split("```");' +
'      for (let i = 0; i < segments.length; i++) {' +
'        const segment = segments[i];' +
'        if (i % 2 === 1) {' +
'          const firstNewline = segment.indexOf("\\n");' +
'          let lang = "code";' +
'          let codeText = segment;' +
'          if (firstNewline !== -1) {' +
'            lang = segment.substring(0, firstNewline).trim() || "code";' +
'            codeText = segment.substring(firstNewline + 1);' +
'          }' +
'          const codeBox = document.createElement("div");' +
'          codeBox.className = "code-container";' +
'          const header = document.createElement("div");' +
'          header.className = "code-header";' +
'          const langSpan = document.createElement("span");' +
'          langSpan.textContent = "⚡ " + lang;' +
'          header.appendChild(langSpan);' +
'          const actionDiv = document.createElement("div");' +
'          actionDiv.className = "code-header-actions";' +
'          const copyBtn = document.createElement("button");' +
'          copyBtn.className = "code-btn code-btn-copy";' +
'          copyBtn.textContent = "📋 Copy";' +
'          (function(c, btn) {' +
'            btn.onclick = function() {' +
'              navigator.clipboard.writeText(c);' +
'              btn.textContent = "✓ Copied";' +
'              setTimeout(function() { btn.textContent = "📋 Copy"; }, 2000);' +
'            };' +
'          })(codeText, copyBtn);' +
'          actionDiv.appendChild(copyBtn);' +
'          const insertBtn = document.createElement("button");' +
'          insertBtn.className = "code-btn code-btn-insert";' +
'          insertBtn.textContent = "📥 Insert into Editor";' +
'          (function(c) {' +
'            insertBtn.onclick = function() {' +
'              vscode.postMessage({ type: "insertCode", code: c });' +
'            };' +
'          })(codeText);' +
'          actionDiv.appendChild(insertBtn);' +
'          header.appendChild(actionDiv);' +
'          codeBox.appendChild(header);' +
'          const pre = document.createElement("pre");' +
'          const codeEl = document.createElement("code");' +
'          codeEl.textContent = codeText;' +
'          pre.appendChild(codeEl);' +
'          codeBox.appendChild(pre);' +
'          wrapper.appendChild(codeBox);' +
'        } else {' +
'          if (segment.trim() !== "") {' +
'            const p = document.createElement("div");' +
'            p.style.whiteSpace = "pre-wrap";' +
'            p.style.margin = "6px 0";' +
'            p.textContent = segment;' +
'            wrapper.appendChild(p);' +
'          }' +
'        }' +
'      }' +
'      return wrapper;' +
'    }' +
'    function appendUserMessage(text) {' +
'      const row = document.createElement("div");' +
'      row.className = "message-row user";' +
'      const bubble = document.createElement("div");' +
'      bubble.className = "bubble user-msg";' +
'      bubble.textContent = text;' +
'      row.appendChild(bubble);' +
'      messagesContainer.appendChild(row);' +
'      scrollToBottom();' +
'    }' +
'    function appendLoadingShimmer() {' +
'      const row = document.createElement("div");' +
'      row.className = "message-row bot";' +
'      row.id = "loadingRow";' +
'      row.innerHTML = ' +
'        \'<div class="bubble bot-msg">\' +' +
'        \'  <span style="font-size:11px;font-weight:700;color:#1a73e8;">✨ Gemini is thinking & generating...</span>\' +' +
'        \'  <div class="shimmer-box">\' +' +
'        \'    <div class="shimmer-line"></div>\' +' +
'        \'    <div class="shimmer-line medium"></div>\' +' +
'        \'    <div class="shimmer-line short"></div>\' +' +
'        \'  </div>\' +' +
'        \'</div>\';' +
'      messagesContainer.appendChild(row);' +
'      scrollToBottom();' +
'    }' +
'    function removeLoadingShimmer() {' +
'      const loading = document.getElementById("loadingRow");' +
'      if (loading) loading.remove();' +
'    }' +
'    function appendBotMessage(reply) {' +
'      removeLoadingShimmer();' +
'      const row = document.createElement("div");' +
'      row.className = "message-row bot";' +
'      const bubble = document.createElement("div");' +
'      bubble.className = "bubble bot-msg";' +
'      bubble.appendChild(parseMarkdownToElements(reply));' +
'      row.appendChild(bubble);' +
'      messagesContainer.appendChild(row);' +
'      playChime();' +
'      scrollToBottom();' +
'    }' +
'    function sendMessage(text) {' +
'      const trimmed = text.trim();' +
'      if (!trimmed) return;' +
'      unlockAudio();' +
'      appendUserMessage(trimmed);' +
'      appendLoadingShimmer();' +
'      vscode.postMessage({ type: "sendMessage", text: trimmed });' +
'      chatInput.value = "";' +
'      chatInput.style.height = "30px";' +
'    }' +
'    sendBtn.addEventListener("click", () => {' +
'      sendMessage(chatInput.value);' +
'    });' +
'    chatInput.addEventListener("keydown", e => {' +
'      if (e.key === "Enter" && !e.shiftKey) {' +
'        e.preventDefault();' +
'        sendMessage(chatInput.value);' +
'      }' +
'    });' +
'    chatInput.addEventListener("input", () => {' +
'      chatInput.style.height = "auto";' +
'      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";' +
'    });' +
'    chatInput.addEventListener("focus", () => { unlockAudio(); });' +
'    clearBtn.addEventListener("click", () => {' +
'      messagesContainer.innerHTML = ' +
'        \'<div class="message-row bot">\' +' +
'        \'  <div class="bubble bot-msg">Conversation cleared. Ready for your questions!</div>\' +' +
'        \'</div>\';' +
'      vscode.postMessage({ type: "clearHistory" });' +
'    });' +
'    chipFix.addEventListener("click", () => {' +
'      unlockAudio();' +
'      vscode.postMessage({ type: "triggerFix" });' +
'    });' +
'    chipExplain.addEventListener("click", () => {' +
'      unlockAudio();' +
'      vscode.postMessage({ type: "triggerExplain" });' +
'    });' +
'    window.addEventListener("message", event => {' +
'      const message = event.data;' +
'      switch (message.type) { ' +
'        case "setLoading":' +
'          sendBtn.disabled = message.isLoading;' +
'          break;' +
'        case "botResponse":' +
'          appendBotMessage(message.reply);' +
'          break;' +
'        case "botError":' +
'          removeLoadingShimmer();' +
'          const errRow = document.createElement("div");' +
'          errRow.className = "message-row bot";' +
'          const errBubble = document.createElement("div");' +
'          errBubble.className = "bubble bot-msg";' +
'          errBubble.style.color = "#dc2626";' +
'          errBubble.style.border = "1px solid #fecaca";' +
'          errBubble.textContent = "⚠️ " + (message.error || "Failed to process request.");' +
'          errRow.appendChild(errBubble);' +
'          messagesContainer.appendChild(errRow);' +
'          scrollToBottom();' +
'          break;' +
'        case "triggerChat":' +
'          sendMessage(message.text);' +
'          break;' +
'      }' +
'    });' +
'  </script>' +
'</body>' +
'</html>';
  }
}

export function deactivate() {}