// chatProvider.ts
import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
import { getLocaleStrings } from './localization';
import { RetryManager } from './utils/retry';

export class OllamaCodeFixerChatProvider {
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _strings = getLocaleStrings();
    private _retryManager: RetryManager;

    constructor(private readonly extensionUri: vscode.Uri) {
        this._retryManager = new RetryManager();
    }

    public show() {
        if (this._panel) {
            this._panel.reveal();
        } else {
            this._panel = vscode.window.createWebviewPanel(
                'ollamaChat',
                'Ollama Code Fixer Chat',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.extensionUri]
                }
            );

            this._panel.webview.html = this.getWebviewContent();
            this.setupMessageHandling();

            this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        }
    }    private setupMessageHandling() {
        if (!this._panel) {
            return;
        }

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendMessage':
                        await this.handleChatMessage(message.text);
                        break;
                    case 'applyCode':
                        await this.applyCodeToEditor(message.code);
                        break;
                    case 'insertPrompt':
                        this._panel?.webview.postMessage({
                            command: 'insertPrompt',
                            prompt: message.prompt
                        });
                        break;
                }
            },
            undefined,
            this._disposables
        );
    }    private async handleChatMessage(userMessage: string) {
        if (!this._panel) {
            return;
        }

        // Отправляем сообщение пользователя в чат
        this._panel.webview.postMessage({
            command: 'addMessage',
            message: {
                type: 'user',
                content: userMessage,
                timestamp: new Date().toLocaleTimeString()
            }
        });

        // Показываем индикатор загрузки
        this._panel.webview.postMessage({
            command: 'setLoading',
            loading: true
        });

        try {
            const response = await this.getOllamaResponse(userMessage);
            
            // Отправляем ответ AI в чат
            this._panel.webview.postMessage({
                command: 'addMessage',
                message: {
                    type: 'assistant',
                    content: response,
                    timestamp: new Date().toLocaleTimeString()
                }
            });        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : typeof error === 'string'
                    ? error
                    : 'Произошла неизвестная ошибка';
                    
            this._panel.webview.postMessage({
                command: 'addMessage',
                message: {
                    type: 'error',
                    content: `Ошибка: ${errorMessage}`,
                    timestamp: new Date().toLocaleTimeString()
                }
            });
        } finally {
            this._panel.webview.postMessage({
                command: 'setLoading',
                loading: false
            });
        }
    }

    private async getOllamaResponse(message: string): Promise<string> {
        const config = vscode.workspace.getConfiguration('ollamaCodeFixer');
        let baseApiUrl = config.get<string>('ollamaApiUrl', 'http://localhost:11434');
        
        try {
            new URL(baseApiUrl);
            baseApiUrl = baseApiUrl.replace(/\/+$/, '');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : this._strings.unknownError;
            console.error(`[OllamaCodeFixer] ${this._strings.invalidUrl} ${baseApiUrl}: ${errorMessage}`);
            baseApiUrl = 'http://localhost:11434';
        }

        const modelName = config.get<string>('modelName', 'llama2');
        const chatEndpoint = '/api/chat';
        const fullApiUrl = `${baseApiUrl}${chatEndpoint}`;

        const logLevel = config.get<string>('logLevel', 'info');

        try {
            // Проверяем доступность модели с помощью RetryManager
            const modelCheckResponse = await this._retryManager.withRetry(async () => {
                return axios.get(`${baseApiUrl}/api/tags`);
            });

            const availableModels = modelCheckResponse.data?.models || [];
            
            if (!availableModels.some((model: any) => model.name === modelName)) {
                console.error(`[OllamaCodeFixer] ${this._strings.modelNotInstalled.replace('{0}', modelName)}`);
                
                const choice = await vscode.window.showErrorMessage(
                    this._strings.modelNotInstalled.replace('{0}', modelName),
                    this._strings.installModel,
                    this._strings.changeModel
                );

                if (choice === this._strings.installModel) {
                    await this.installOllamaModel(modelName);
                    return this._strings.modelInstallStarted.replace('{0}', modelName);
                } else if (choice === this._strings.changeModel) {
                    const newModel = await vscode.window.showQuickPick(
                        availableModels.map((m: any) => m.name),
                        {
                            placeHolder: this._strings.selectAvailableModel
                        }
                    );
                    
                    if (newModel) {
                        await config.update('modelName', newModel, true);
                        return this.getOllamaResponse(message);
                    }
                }
                
                return this._strings.modelNotInstalled.replace('{0}', modelName);
            }
        } catch (error: unknown) {
            console.error('[OllamaCodeFixer] Failed to check available models:', error);
            if (error instanceof Error) {
                vscode.window.showWarningMessage(`Failed to check models: ${error.message}`);
            }
        }

        const payload = {
            model: modelName,
            messages: [{ role: "user", content: message }],
            stream: false,
            options: {
                temperature: config.get<number>('temperature', 0.7),
                top_p: config.get<number>('topP', 0.9),
                top_k: config.get<number>('topK', 40),
                repeat_penalty: config.get<number>('repeatPenalty', 1.1),
                presence_penalty: config.get<number>('presencePenalty', 0),
                frequency_penalty: config.get<number>('frequencyPenalty', 0),
                mirostat: config.get<number>('mirostat', 0),
                mirostat_tau: config.get<number>('mirostatTau', 5.0),
                mirostat_eta: config.get<number>('mirostatEta', 0.1),
                num_ctx: config.get<number>('contextLength', 4096),
                num_predict: config.get<number>('maxTokens', 2048),
                stop: config.get<string[]>('stopSequences', ["[/INST]", "</s>", "```"]),
                seed: config.get<number>('seed', -1)
            }
        };

        if (logLevel === 'debug') {
            console.debug('[OllamaCodeFixer CHAT] Request details:');
            console.debug(`- Base URL: ${baseApiUrl}`);
            console.debug(`- Full URL: ${fullApiUrl}`);
            console.debug(`- Model: ${modelName}`);
            console.debug(`- Payload: ${JSON.stringify(payload, null, 2)}`);
        }

        try {
            if (!fullApiUrl.startsWith('http://') && !fullApiUrl.startsWith('https://')) {
                throw new Error(`Invalid URL protocol: ${fullApiUrl}`);
            }

            // Используем RetryManager для запроса к API
            const response = await this._retryManager.withRetry(async () => {
                return axios.post(fullApiUrl, payload, {
                    timeout: config.get<number>('requestTimeout', 90000)
                });
            });
            
            if (logLevel === 'debug') {
                console.debug(`[OllamaCodeFixer CHAT] Raw response from model: ${JSON.stringify(response.data, null, 2)}`);
            }

            return response.data.message && response.data.message.content 
                ? response.data.message.content.trim() 
                : JSON.stringify(response.data);

        } catch (error: unknown) {
            let errorMessage = 'Ошибка взаимодействия с Ollama: ';
            
            if (error instanceof AxiosError) {
                errorMessage += error.message;
                
                if (error.response) {
                    errorMessage += ` (Статус: ${error.response.status})`;
                    if (error.response.data) {
                        errorMessage += `\nДетали: ${JSON.stringify(error.response.data)}`;
                    }
                } else if (error.request) {
                    errorMessage += '\nНет ответа от сервера Ollama. Проверьте, что сервис запущен и доступен.';
                }
                
                if (logLevel === 'debug') {
                    console.error('[OllamaCodeFixer] Подробности ошибки API:', {
                        message: error.message,
                        config: error.config,
                        response: error.response?.data
                    });
                }
            } else if (error instanceof Error) {
                errorMessage += error.message;
            } else {
                errorMessage += 'Неизвестная ошибка';
            }
            
            console.error('[OllamaCodeFixer] Error:', errorMessage);
            return errorMessage;
        }
    }    private async applyCodeToEditor(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(this._strings.noActiveEditor);
            return;
        }

        const selection = editor.selection;
        await editor.edit(editBuilder => {
            if (selection.isEmpty) {
                editBuilder.insert(selection.start, code);
            } else {
                editBuilder.replace(selection, code);
            }
        });

        vscode.window.showInformationMessage(this._strings.codeAppliedSuccess);
    }    private async installOllamaModel(modelName: string): Promise<void> {
        const terminal = vscode.window.createTerminal('Ollama Model Installation');
        terminal.show();
        terminal.sendText(`ollama pull ${modelName}`);
        
        // Показываем информационное сообщение
        vscode.window.showInformationMessage(
            this._strings.modelInstallProgress.replace('{0}', modelName),
            this._strings.understood
        );
    }

    private async getAvailableModels(baseUrl: string): Promise<string[]> {
        try {
            const response = await axios.get(`${baseUrl}/api/tags`);
            return response.data?.models?.map((m: any) => m.name) || [];
        } catch (error) {
            console.error('[OllamaCodeFixer] Failed to fetch available models:', error);
            return [];
        }
    }

    private async showModelSelector(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('ollamaCodeFixer');
        const baseUrl = config.get<string>('ollamaApiUrl', 'http://localhost:11434');
        
        const models = await this.getAvailableModels(baseUrl);
        
        return vscode.window.showQuickPick(models, {
            placeHolder: this._strings.selectModel
        });
    }

    private getWebviewContent(): string {
        return `
        <!DOCTYPE html>
        <html lang="${this._strings.language}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${this._strings.chatTitle}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }

                .header {
                    padding: 16px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-panel-background);
                }

                .header h1 {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 8px;
                }

                .prompts-section {
                    padding: 16px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-sideBar-background);
                }

                .prompts-title {
                    font-size: 14px;
                    font-weight: 500;
                    margin-bottom: 12px;
                    opacity: 0.8;
                }

                .prompt-buttons {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .prompt-btn {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background-color 0.2s;
                }

                .prompt-btn:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }

                .chat-container {
                    flex: 1;
                    padding: 16px;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .message {
                    max-width: 80%;
                    padding: 12px 16px;
                    border-radius: 12px;
                    position: relative;
                }

                .message.user {
                    align-self: flex-end;
                    background: var(--vscode-inputValidation-infoBorder);
                    color: white;
                }

                .message.assistant {
                    align-self: flex-start;
                    background: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                }

                .message.error {
                    align-self: center;
                    background: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                }

                .message-time {
                    font-size: 11px;
                    opacity: 0.6;
                    margin-top: 4px;
                }

                .code-block {
                    background: var(--vscode-textCodeBlock-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 12px;
                    margin: 8px 0;
                    font-family: 'Courier New', monospace;
                    position: relative;
                    overflow-x: auto;
                }

                .code-actions {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    display: flex;
                    gap: 4px;
                }

                .code-btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 8px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 11px;
                }

                .input-section {
                    padding: 16px;
                    border-top: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-panel-background);
                }

                .input-container {
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                }

                .message-input {
                    flex: 1;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 12px;
                    resize: vertical;
                    min-height: 40px;
                    max-height: 120px;
                    font-family: inherit;
                }

                .send-btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 12px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 500;
                }

                .send-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .loading {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 12px;
                    align-self: flex-start;
                    max-width: 80%;
                }

                .loading-dots {
                    display: flex;
                    gap: 4px;
                }

                .loading-dot {
                    width: 6px;
                    height: 6px;
                    background: var(--vscode-editor-foreground);
                    border-radius: 50%;
                    animation: loadingDot 1.4s ease-in-out infinite both;
                }

                .loading-dot:nth-child(1) { animation-delay: -0.32s; }
                .loading-dot:nth-child(2) { animation-delay: -0.16s; }

                @keyframes loadingDot {
                    0%, 80%, 100% { opacity: 0.3; }
                    40% { opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${this._strings.chatTitle}</h1>
                <p>${this._strings.welcomeMessage}</p>
            </div>

            <div class="prompts-section">
                <div class="prompts-title">${this._strings.quickPromptsTitle}</div>
                <div class="prompt-buttons">
                    <button class="prompt-btn" onclick="insertPrompt('${this._strings.fixErrorsPrompt}')">${this._strings.fixErrorsPrompt}</button>
                    <button class="prompt-btn" onclick="insertPrompt('${this._strings.optimizePrompt}')">${this._strings.optimizePrompt}</button>
                    <button class="prompt-btn" onclick="insertPrompt('${this._strings.addCommentsPrompt}')">${this._strings.addCommentsPrompt}</button>
                    <button class="prompt-btn" onclick="insertPrompt('${this._strings.refactorPrompt}')">${this._strings.refactorPrompt}</button>
                    <button class="prompt-btn" onclick="insertPrompt('${this._strings.checkSecurityPrompt}')">${this._strings.checkSecurityPrompt}</button>
                    <button class="prompt-btn" onclick="insertPrompt('${this._strings.createTestsPrompt}')">${this._strings.createTestsPrompt}</button>
                    <button class="prompt-btn" onclick="insertPrompt('${this._strings.explainCodePrompt}')">${this._strings.explainCodePrompt}</button>
                </div>
            </div>

            <div class="chat-container" id="chatContainer">
                <div class="message assistant">
                    <div>${this._strings.welcomeMessage}</div>
                    <div class="message-time">${new Date().toLocaleTimeString()}</div>
                </div>
            </div>

            <div class="input-section">
                <div class="input-container">
                    <textarea 
                        class="message-input" 
                        id="messageInput" 
                        placeholder="${this._strings.inputPlaceholder}"
                        rows="1"
                    ></textarea>
                    <button class="send-btn" id="sendBtn" onclick="sendMessage()">${this._strings.sendButton}</button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const strings = ${JSON.stringify({
                    copyButton: this._strings.copyButton,
                    applyButton: this._strings.applyButton,
                    copied: this._strings.copyButton,
                    loadingMessage: this._strings.loadingMessage
                })};
                let isLoading = false;

                function insertPrompt(prompt) {
                    const input = document.getElementById('messageInput');
                    input.value = prompt;
                    input.focus();
                }

                function sendMessage() {
                    const input = document.getElementById('messageInput');
                    const message = input.value.trim();
                    
                    if (!message || isLoading) return;
                    
                    input.value = '';
                    vscode.postMessage({
                        command: 'sendMessage',
                        text: message
                    });
                }

                function addMessage(message) {
                    const container = document.getElementById('chatContainer');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message ' + message.type;
                    
                    let content = message.content;
                    
                    // Обработка кода в сообщениях
                    content = content.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, (match, code) => {
                        return '<div class="code-block">' +
                               '<div class="code-actions">' +
                               '<button class="code-btn" onclick="copyCode(this)">' + strings.copyButton + '</button>' +
                               '<button class="code-btn" onclick="applyCode(this)">' + strings.applyButton + '</button>' +
                               '</div>' +
                               '<pre>' + code.trim() + '</pre>' +
                               '</div>';
                    });
                    
                    messageDiv.innerHTML = 
                        '<div>' + content + '</div>' +
                        '<div class="message-time">' + message.timestamp + '</div>';
                    
                    container.appendChild(messageDiv);
                    container.scrollTop = container.scrollHeight;
                }

                function setLoading(loading) {
                    isLoading = loading;
                    const sendBtn = document.getElementById('sendBtn');
                    const container = document.getElementById('chatContainer');
                    
                    sendBtn.disabled = loading;
                    
                    // Удаляем предыдущий индикатор загрузки
                    const existingLoading = container.querySelector('.loading');
                    if (existingLoading) {
                        existingLoading.remove();
                    }
                    
                    if (loading) {
                        const loadingDiv = document.createElement('div');
                        loadingDiv.className = 'loading';
                        loadingDiv.innerHTML = 
                            '<div>' + strings.loadingMessage + '</div>' +
                            '<div class="loading-dots">' +
                            '<div class="loading-dot"></div>' +
                            '<div class="loading-dot"></div>' +
                            '<div class="loading-dot"></div>' +
                            '</div>';
                        container.appendChild(loadingDiv);
                        container.scrollTop = container.scrollHeight;
                    }
                }

                function copyCode(button) {
                    const codeBlock = button.closest('.code-block').querySelector('pre');
                    navigator.clipboard.writeText(codeBlock.textContent);
                    button.textContent = strings.copied;
                    setTimeout(() => {
                        button.textContent = strings.copyButton;
                    }, 2000);
                }

                function applyCode(button) {
                    const codeBlock = button.closest('.code-block').querySelector('pre');
                    vscode.postMessage({
                        command: 'applyCode',
                        code: codeBlock.textContent
                    });
                }

                // Обработка Enter для отправки сообщения
                document.getElementById('messageInput').addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                // Слушаем сообщения от расширения
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'addMessage':
                            addMessage(message.message);
                            break;
                        case 'setLoading':
                            setLoading(message.loading);
                            break;
                        case 'insertPrompt':
                            document.getElementById('messageInput').value = message.prompt;
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }    public dispose() {
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        if (this._panel) {
            this._panel.dispose();
        }
        this._panel = undefined;
    }
}