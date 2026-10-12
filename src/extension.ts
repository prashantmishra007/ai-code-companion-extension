import * as vscode from 'vscode';
import { exec } from 'child_process';

const API_BASE = 'https://ai-copilot-backend-oskz.onrender.com';

let isCompletionsEnabled = true;
let statusBarItem: vscode.StatusBarItem;
let diagnosticCollection: vscode.DiagnosticCollection;

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

  // 2. Status Bar Badge (Clickable Toggle)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'ai-companion.toggleCompletions';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 3. Inline Ghost Text & Comment-to-Code Provider
  const inlineCompletionProvider = new GeminiInlineCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      inlineCompletionProvider
    )
  );

  // 4. Security & Secret Scanner Diagnostics Setup
  diagnosticCollection = vscode.languages.createDiagnosticCollection('gemini-security');
  context.subscriptions.push(diagnosticCollection);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      const config = vscode.workspace.getConfiguration('aiCompanion');
      if (config.get<boolean>('securityScanOnSave', true)) {
        scanDocumentForSecrets(doc);
      }
    })
  );

  // 5. Smart Hover Tooltip Provider (Explaining regex & complex blocks)
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ pattern: '**' }, {
      provideHover(document, position) {
        const lineText = document.lineAt(position.line).text;
        // Check for regex literals
        const regexMatch = lineText.match(/\/(.*?)\/[gimsuy]*/);
        if (regexMatch && position.character >= lineText.indexOf(regexMatch[0]) && position.character <= lineText.indexOf(regexMatch[0]) + regexMatch[0].length) {
          const contents = new vscode.MarkdownString();
          contents.isTrusted = true;
          contents.appendMarkdown(`**✨ Gemini Regex Insight**\n\n`);
          contents.appendMarkdown(`Pattern: \`${regexMatch[0]}\`\n\n`);
          contents.appendMarkdown(`*Regular expression detected. Select line & use \`Explain Code\` for exhaustive breakdown.*`);
          return new vscode.Hover(contents);
        }
        return undefined;
      }
    })
  );

  // 6. Feature: Floating Inline Chat (`Ctrl + I` - Cursor Style with Safe Diff Option)
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.inlineChat', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.selection;
      const selectedCode = selection.isEmpty ? editor.document.lineAt(selection.active.line).text : editor.document.getText(selection);

      const userInstruction = await vscode.window.showInputBox({
        title: '✨ Gemini Inline Edit (Cursor Style)',
        prompt: 'Code me kya modify/generate karna hai? (e.g., "Add validation", "Refactor to async/await")',
        placeHolder: 'Enter instructions here...'
      });

      if (!userInstruction || !userInstruction.trim()) return;

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '✨ Gemini: Generating inline changes...',
          cancellable: false
        },
        async () => {
          try {
            const prompt = `You are an expert AI code editor. 
Original Code:
\`\`\`${editor.document.languageId}
${selectedCode}
\`\`\`

User Instruction: "${userInstruction}"

Respond strictly with ONLY the modified replacement code. Do not wrap in markdown \`\`\`, do not include explanations or conversational pleasantries.`;

            const res = await fetch(API_BASE + '/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: prompt, history: [] })
            });

            const data = (await res.json()) as { reply?: string };
            let updatedCode = data.reply || '';
            updatedCode = updatedCode.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();

            const action = await vscode.window.showInformationMessage(
              '✨ Gemini: Code ready! Apply changes directly or review diff?',
              'Apply Directly',
              'Review Diff'
            );

            if (action === 'Apply Directly') {
              await editor.edit(editBuilder => {
                if (selection.isEmpty) {
                  editBuilder.replace(editor.document.lineAt(selection.active.line).range, updatedCode);
                } else {
                  editBuilder.replace(selection, updatedCode);
                }
              });
              vscode.window.showInformationMessage('Code updated successfully!');
            } else if (action === 'Review Diff') {
              const originalDoc = await vscode.workspace.openTextDocument({ content: selectedCode, language: editor.document.languageId });
              const modifiedDoc = await vscode.workspace.openTextDocument({ content: updatedCode, language: editor.document.languageId });
              await vscode.commands.executeCommand('vscode.diff', originalDoc.uri, modifiedDoc.uri, 'Original ↔ Gemini Edit');
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`Inline edit error: ${err.message}`);
          }
        }
      );
    })
  );

  // 7. Feature: AI Git Commit Message Generator
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.generateCommitMessage', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace opened for Git commit generation.');
        return;
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '✨ Gemini: Analyzing Git Diff...',
          cancellable: false
        },
        async () => {
          exec('git diff --cached', { cwd: workspaceFolder }, async (err, stdout) => {
            let diffContent = stdout;
            if (!diffContent || !diffContent.trim()) {
              // Try unstaged if nothing staged
              exec('git diff', { cwd: workspaceFolder }, async (_err2, stdout2) => {
                diffContent = stdout2;
                if (!diffContent || !diffContent.trim()) {
                  vscode.window.showWarningMessage('No changes detected in Git (staged or unstaged).');
                  return;
                }
                await processDiffCommit(diffContent);
              });
            } else {
              await processDiffCommit(diffContent);
            }
          });
        }
      );
    })
  );

  // 8. Feature: Terminal Error Auto-Fixer
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.fixTerminalError', async () => {
      const errorText = await vscode.window.showInputBox({
        title: '✨ Gemini Terminal Error Fixer',
        prompt: 'Terminal ki error paste karein ya summary likhein',
        placeHolder: 'e.g., npm ERR! code ERESOLVE, TypeError: Cannot read properties of undefined...'
      });

      if (!errorText || !errorText.trim()) return;

      provider.sendUserMessageToChat(`Diagnose this terminal error and provide the exact fix:\n\`\`\`\n${errorText}\n\`\`\``);
    })
  );

  // 9. Feature: Automated Project Boilerplate Generator
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.generateBoilerplate', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'Dockerfile (Node.js/Production)', detail: 'Multi-stage optimized production Dockerfile' },
          { label: 'Express.js REST Starter', detail: 'Express app with CORS, JSON parser & basic routes' },
          { label: 'MongoDB Mongoose Model', detail: 'Standard schema with timestamps and validation' },
          { label: 'HTML5 + Tailwind CSS Starter', detail: 'Clean responsive starter template' }
        ],
        { placeHolder: 'Select template to generate' }
      );

      if (!choice) return;

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `✨ Generating ${choice.label}...`,
          cancellable: false
        },
        async () => {
          try {
            const prompt = `Generate a clean, production-ready ${choice.label}. Return ONLY the file contents, no markdown, no filler text.`;
            const res = await fetch(API_BASE + '/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: prompt, history: [] })
            });

            const data = (await res.json()) as { reply?: string };
            let code = (data.reply || '').replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');

            const doc = await vscode.workspace.openTextDocument({
              content: code,
              language: choice.label.includes('Docker') ? 'dockerfile' : choice.label.includes('HTML') ? 'html' : 'javascript'
            });
            await vscode.window.showTextDocument(doc);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to scaffold: ${err.message}`);
          }
        }
      );
    })
  );

  // 10. Existing Features: Hotkey Toggle, Unit Tests, JSDoc, Fix & Explain
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.toggleCompletions', () => {
      isCompletionsEnabled = !isCompletionsEnabled;
      updateStatusBar();
      const statusText = isCompletionsEnabled ? 'Enabled (Active)' : 'Disabled (Paused)';
      vscode.window.showInformationMessage(`Gemini Inline Suggestions: ${statusText}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.generateTests', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.selection;
      const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
      if (!text.trim()) return;

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '✨ Gemini: Generating Unit Tests...' },
        async () => {
          try {
            const prompt = `Generate unit test cases with assertions for this ${editor.document.languageId} code:\n\n${text}\n\nReturn ONLY executable test code. No markdown.`;
            const res = await fetch(API_BASE + '/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: prompt, history: [] })
            });
            const data = (await res.json()) as { reply?: string };
            let testCode = (data.reply || '').replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
            const doc = await vscode.workspace.openTextDocument({ content: testCode, language: editor.document.languageId });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Tests error: ${err.message}`);
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.addDocstring', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.selection;
      const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
      if (!text.trim()) return;

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '✨ Gemini: Generating Documentation...' },
        async () => {
          try {
            const prompt = `Write standard documentation comments (JSDoc) for this ${editor.document.languageId} code:\n\n${text}\n\nReturn strictly ONLY the doc comment block (starting with /**).`;
            const res = await fetch(API_BASE + '/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: prompt, history: [] })
            });
            const data = (await res.json()) as { reply?: string };
            let docComment = (data.reply || '').replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
            await editor.edit(editBuilder => {
              editBuilder.insert(selection.start, docComment + '\n');
            });
            vscode.window.showInformationMessage('Documentation comments added!');
          } catch (err: any) {
            vscode.window.showErrorMessage(`Doc error: ${err.message}`);
          }
        }
      );
    })
  );

  const executeFixCode = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const selection = editor.selection;
    const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
    if (!text.trim()) return;
    provider.sendUserMessageToChat('Fix and refactor this code:\n```\n' + text + '\n```');
  };

  const executeExplainCode = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const selection = editor.selection;
    const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
    if (!text.trim()) return;
    provider.sendUserMessageToChat('Explain this code step-by-step:\n```\n' + text + '\n```');
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-companion.fixCode', executeFixCode),
    vscode.commands.registerCommand('ai-companion.explainCode', executeExplainCode)
  );

  provider.onFixRequested(executeFixCode);
  provider.onExplainRequested(executeExplainCode);
}

// Helper: Scan file for sensitive leaked tokens & keys
function scanDocumentForSecrets(document: vscode.TextDocument) {
  const text = document.getText();
  const diagnostics: vscode.Diagnostic[] = [];

  const secretPatterns = [
    { regex: /(?:AIza[0-9A-Za-z-_]{35})/g, name: 'Google API Key' },
    { regex: /(?:sk-[a-zA-Z0-9]{20,})/g, name: 'Secret API Key' },
    { regex: /(?:ghp_[a-zA-Z0-9]{36})/g, name: 'GitHub Personal Token' },
    { regex: /mongodb(?:\+srv)?:\/\/[^\s"']+/g, name: 'Hardcoded MongoDB Connection URI' }
  ];

  secretPatterns.forEach(({ regex, name }) => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);
      const diagnostic = new vscode.Diagnostic(
        range,
        `⚠️ Security Warning: Potential hardcoded ${name} detected. Store secrets in .env instead!`,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostics.push(diagnostic);
    }
  });

  diagnosticCollection.set(document.uri, diagnostics);
}

// Helper: Git commit generator logic
async function processDiffCommit(diffText: string) {
  try {
    const prompt = `Generate a concise, professional Git commit message adhering to conventional commit guidelines based on this git diff:\n\n${diffText.substring(0, 3000)}\n\nReturn strictly ONLY the commit message line (e.g. "feat(auth): add token validation").`;
    const res = await fetch(API_BASE + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, history: [] })
    });

    const data = (await res.json()) as { reply?: string };
    const commitMsg = (data.reply || '').replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();

    await vscode.env.clipboard.writeText(commitMsg);
    vscode.window.showInformationMessage(`✨ AI Commit Message: "${commitMsg}" (Copied to Clipboard!)`);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Commit generation failed: ${err.message}`);
  }
}

function updateStatusBar() {
  if (isCompletionsEnabled) {
    statusBarItem.text = '$(sparkle) Gemini: Active';
    statusBarItem.tooltip = 'Gemini Inline Completions: ON (Click or press Alt+\\ to toggle)';
  } else {
    statusBarItem.text = '$(circle-slash) Gemini: Paused';
    statusBarItem.tooltip = 'Gemini Inline Completions: OFF (Click or press Alt+\\ to toggle)';
  }
}

/**
 * Inline Completion Provider with Multi-file Context & Workspace Intelligence
 */
class GeminiInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!isCompletionsEnabled || token.isCancellationRequested) return undefined;

    const currentLineText = document.lineAt(position.line).text;
    const linePrefix = currentLineText.substring(0, position.character);

    const prevLineText = position.line > 0 ? document.lineAt(position.line - 1).text.trim() : '';
    const isCommentOnPrevLine = prevLineText.startsWith('//') || prevLineText.startsWith('#') || prevLineText.startsWith('/*');

    if (!linePrefix.trim() && !isCommentOnPrevLine) return undefined;

    // Configurable debounce delay
    const config = vscode.workspace.getConfiguration('aiCompanion');
    const delay = config.get<number>('debounceDelay', 400);

    await new Promise(resolve => setTimeout(resolve, delay));
    if (token.isCancellationRequested || !isCompletionsEnabled) return undefined;

    // Context from surrounding lines
    const startLine = Math.max(0, position.line - 25);
    const prefixRange = new vscode.Range(startLine, 0, position.line, position.character);
    const prefixCode = document.getText(prefixRange);

    // Multi-File Awareness: grab imports / context from another open editor tab
    let workspaceContext = '';
    const otherDocs = vscode.workspace.textDocuments.filter(d => d !== document && !d.isUntitled);
    if (otherDocs.length > 0) {
      const topOther = otherDocs[0].getText().substring(0, 300);
      workspaceContext = `Related file context:\n${topOther}\n`;
    }

    try {
      let prompt = '';
      if (isCommentOnPrevLine && !linePrefix.trim()) {
        prompt = `You are a high-speed code generation engine like GitHub Copilot.
${workspaceContext}
Specification comment: "${prevLineText}" in a ${document.languageId} file.
Generate clean implementation code under the comment.
Return ONLY raw runnable code. DO NOT use markdown code blocks (\`\`\`), no explanations, no repeating comment.`;
      } else {
        prompt = `You are a high-speed inline code autocomplete engine like GitHub Copilot.
${workspaceContext}
Complete the code immediately after cursor in ${document.languageId}.
Return ONLY raw code completion. DO NOT use markdown (\`\`\`), no explanations.

Prefix Code:
${prefixCode}`;
      }

      const response = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, history: [] })
      });

      if (!response.ok || token.isCancellationRequested || !isCompletionsEnabled) return undefined;

      const data = (await response.json()) as { reply?: string };
      let completion = (data.reply || '').replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trimEnd();

      if (!completion || token.isCancellationRequested) return undefined;

      return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
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
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleChatMessage(data.text);
          break;
        case 'insertCode':
          if (this._insertCallback) await this._insertCallback(data.code);
          break;
        case 'clearHistory':
          this._history = [];
          break;
        case 'triggerFix':
          if (this._fixCallback) await this._fixCallback();
          break;
        case 'triggerExplain':
          if (this._explainCallback) await this._explainCallback();
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
        body: JSON.stringify({ message: userMessage, history: this._history })
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || ('HTTP ' + response.status));
      }

      const result = (await response.json()) as { reply: string };
      this._history.push({ role: 'user', text: userMessage });
      this._history.push({ role: 'model', text: result.reply });

      this._view.webview.postMessage({ type: 'botResponse', reply: result.reply });
    } catch (err: any) {
      this._view.webview.postMessage({ type: 'botError', error: err.message || 'Failed to get response.' });
    } finally {
      this._view.webview.postMessage({ type: 'setLoading', isLoading: false });
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
      --bg-color: #f0f4f9;
      --card-bg: #ffffff;
      --text-color: #1f2937;
      --border-color: #e2e8f0;
      --card-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    }
    * { box-sizing: border-box; }
    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 13px;
      margin: 0; padding: 0;
      display: flex; flex-direction: column; height: 100vh; overflow: hidden;
    }
    .chat-header {
      padding: 12px 14px; background: #ffffff; border-bottom: 1px solid var(--border-color);
      display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .avatar-icon {
      width: 32px; height: 32px; border-radius: 50%;
      background: linear-gradient(135deg, #1a73e8 0%, #8ab4f8 50%, #7b1fa2 100%);
      color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;
    }
    .header-title { font-weight: 700; font-size: 13px; color: #1e1f20; display: block; }
    .status-text { font-size: 10.5px; color: #137333; display: flex; align-items: center; gap: 5px; font-weight: 600; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #1e8e3e; }
    .clear-btn { background: #fce8e6; border: 1px solid #fad2cf; color: #c5221f; border-radius: 20px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; }
    .quick-actions-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 12px; background: #f8fafd; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
    .btn-action-3d { border: none; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; color: #fff; }
    .btn-fix { background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%); }
    .btn-explain { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); }
    .chat-messages { flex: 1; overflow-y: auto; padding: 16px 12px; display: flex; flex-direction: column; gap: 14px; }
    .message-row { display: flex; flex-direction: column; max-width: 96%; }
    .message-row.user { align-self: flex-end; align-items: flex-end; }
    .message-row.bot { align-self: flex-start; align-items: flex-start; width: 100%; }
    .bubble { padding: 11px 15px; border-radius: 14px; line-height: 1.55; font-size: 13px; word-break: break-word; }
    .bubble.user-msg { background: #1a73e8; color: #ffffff; border-bottom-right-radius: 3px; }
    .bubble.bot-msg { background: #ffffff; border: 1px solid var(--border-color); border-bottom-left-radius: 3px; box-shadow: var(--card-shadow); color: #1f2937; width: 100%; }
    .code-container { margin: 10px 0; border-radius: 10px; overflow: hidden; background: #111827; }
    .code-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #1f2937; font-size: 11px; color: #93c5fd; font-weight: 700; }
    .code-btn { border: none; padding: 4px 9px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; margin-left: 6px; }
    .code-btn-copy { background: rgba(255,255,255,0.15); color: #fff; }
    .code-btn-insert { background: #10b981; color: #fff; }
    pre { margin: 0; padding: 12px; overflow-x: auto; font-family: monospace; font-size: 12.5px; color: #e5e7eb; }
    .chat-input-bar { padding: 12px 14px; background: #ffffff; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
    .input-wrapper { background: #f0f4f9; border-radius: 20px; border: 1px solid #d3e3fd; padding: 8px 14px; display: flex; align-items: flex-end; gap: 10px; }
    textarea { flex: 1; background: transparent; border: none; color: #1f2937; font-family: inherit; font-size: 13px; resize: none; height: 30px; outline: none; }
    .send-btn { width: 32px; height: 32px; border-radius: 50%; border: none; background: #1a73e8; color: #ffffff; font-size: 14px; cursor: pointer; flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="chat-header">
    <div class="header-left">
      <div class="avatar-icon">✨</div>
      <div>
        <span class="header-title">Gemini Assistant</span>
        <span class="status-text"><span class="status-dot"></span>Active • Gemini 3.8 Flash</span>
      </div>
    </div>
    <button class="clear-btn" id="clearBtn">Clear</button>
  </div>
  <div class="quick-actions-bar">
    <button class="btn-action-3d btn-fix" id="chipFix"><span>⚡</span> Fix & Refactor</button>
    <button class="btn-action-3d btn-explain" id="chipExplain"><span>📑</span> Explain Code</button>
  </div>
  <div class="chat-messages" id="messagesContainer">
    <div class="message-row bot">
      <div class="bubble bot-msg">
        ✨ <strong>Namaste!</strong> Main aapka Gemini AI coding companion hoon.<br/>
        Try shortcuts: <code>Ctrl + I</code> (Inline edit) aur <code>Alt + \\</code> (Toggle Autocomplete).
      </div>
    </div>
  </div>
  <div class="chat-input-bar">
    <div class="input-wrapper">
      <textarea id="chatInput" placeholder="Ask Gemini anything..."></textarea>
      <button class="send-btn" id="sendBtn">➤</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesContainer = document.getElementById('messagesContainer');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const chipFix = document.getElementById('chipFix');
    const chipExplain = document.getElementById('chipExplain');

    function parseMarkdown(text) {
      const wrapper = document.createElement('div');
      const segments = text.split('\`\`\`');
      for (let i = 0; i < segments.length; i++) {
        if (i % 2 === 1) {
          const firstLine = segments[i].indexOf('\\n');
          const codeText = firstLine !== -1 ? segments[i].substring(firstLine + 1) : segments[i];
          const box = document.createElement('div');
          box.className = 'code-container';
          box.innerHTML = \`<div class="code-header"><span>CODE</span><div><button class="code-btn code-btn-copy" onclick="navigator.clipboard.writeText(\\\`\${codeText.replace(/[\`\\\\]/g, '\\\\$&')}\\\`)">Copy</button><button class="code-btn code-btn-insert" onclick="vscode.postMessage({type:'insertCode', code:\\\`\${codeText.replace(/[\`\\\\]/g, '\\\\$&')}\\\`})">Insert</button></div></div><pre><code>\${codeText}</code></pre>\`;
          wrapper.appendChild(box);
        } else if (segments[i].trim()) {
          const p = document.createElement('div');
          p.style.whiteSpace = 'pre-wrap';
          p.textContent = segments[i];
          wrapper.appendChild(p);
        }
      }
      return wrapper;
    }

    function addMessage(text, isUser) {
      const row = document.createElement('div');
      row.className = 'message-row ' + (isUser ? 'user' : 'bot');
      const b = document.createElement('div');
      b.className = 'bubble ' + (isUser ? 'user-msg' : 'bot-msg');
      if (isUser) { b.textContent = text; } else { b.appendChild(parseMarkdown(text)); }
      row.appendChild(b);
      messagesContainer.appendChild(row);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    sendBtn.onclick = () => {
      const txt = chatInput.value.trim();
      if (!txt) return;
      addMessage(txt, true);
      vscode.postMessage({ type: 'sendMessage', text: txt });
      chatInput.value = '';
    };

    chatInput.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); } };
    clearBtn.onclick = () => { messagesContainer.innerHTML = ''; vscode.postMessage({ type: 'clearHistory' }); };
    chipFix.onclick = () => vscode.postMessage({ type: 'triggerFix' });
    chipExplain.onclick = () => vscode.postMessage({ type: 'triggerExplain' });

    window.addEventListener('message', e => {
      const m = e.data;
      if (m.type === 'botResponse') addMessage(m.reply, false);
      if (m.type === 'triggerChat') { addMessage(m.text, true); vscode.postMessage({ type: 'sendMessage', text: m.text }); }
    });
  </script>
</body>
</html>`;
  }
}

export function deactivate() {}