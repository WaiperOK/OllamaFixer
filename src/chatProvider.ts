// chatProvider.ts
import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';

export class OllamaCodeFixerChatProvider {
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {}

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
    }

    private setupMessageHandling() {
        if (!this._panel) return;

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
    }

    private async handleChatMessage(userMessage: string) {
        if (!this._panel) return;

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
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'addMessage',
                message: {
                    type: 'error',
                    content: `Ошибка: ${error}`,
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
    // ВАЖНО: Убедись, что ollamaApiUrl здесь содержит ТОЛЬКО базовый URL (http://localhost:11434)
    let baseApiUrl = config.get<string>('ollamaApiUrl', 'http://localhost:11434'); 
    const modelName = config.get<string>('modelName', 'gemma:4b');

    // Определяем, какой эндпоинт и какой payload использовать для чата
    // Рекомендую использовать /api/chat для чата
    const chatEndpoint = '/api/chat'; 
    const fullApiUrl = baseApiUrl.replace(/\/$/, '') + chatEndpoint; // Убираем слэш в конце baseApiUrl, если он есть

    const payload = {
        model: modelName,
        messages: [ // Для /api/chat нужен массив messages
            { role: "user", content: message }
        ],
        stream: false
    };

    // Логирование перед запросом
    const logLevel = config.get<string>('logLevel', 'info');
    if (logLevel === 'debug') {
        console.debug(`[OllamaCodeFixer CHAT] Sending request to: POST ${fullApiUrl}`);
        console.debug(`[OllamaCodeFixer CHAT] Payload: ${JSON.stringify(payload, null, 2)}`);
    }

    try {
        const response = await axios.post(fullApiUrl, payload, {
            timeout: config.get<number>('requestTimeout', 90000)
        });
        
        if (logLevel === 'debug') {
            console.debug(`[OllamaCodeFixer CHAT] Raw response from model: ${JSON.stringify(response.data, null, 2)}`);
        }
        // Для /api/chat ответ обычно в response.data.message.content
        return response.data.message && response.data.message.content ? response.data.message.content.trim() : JSON.stringify(response.data);

    } catch (error) {
        const axiosError = error as AxiosError;
        let errorMessage = `Error calling Ollama API for chat: ${axiosError.message}.`;
        if (axiosError.response) {
            errorMessage += ` Status: ${axiosError.response.status}. Data: ${JSON.stringify(axiosError.response.data)}`;
            if (logLevel === 'debug') {
                console.error(`[OllamaCodeFixer CHAT] Ollama API Error Response: ${JSON.stringify(axiosError.response.data, null, 2)}`);
                console.error(`[OllamaCodeFixer CHAT] Request config that failed:`, axiosError.config);
            }
        } else if (axiosError.request) {
            errorMessage += ' No response received from Ollama.';
        }
        console.error('[OllamaCodeFixer CHAT] API Call Error:', errorMessage, axiosError.config);
        // Вместо того, чтобы бросать ошибку дальше, можно вернуть ее текст, чтобы он отобразился в чате
        // throw new Error(errorMessage); // Это приведет к тому, что в handleChatMessage сработает catch
        return `Ошибка взаимодействия с Ollama: ${errorMessage}`; // Чтобы ошибка отобразилась в чате как сообщение
    }
}

    private async applyCodeToEditor(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Нет активного редактора для вставки кода');
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

        vscode.window.showInformationMessage('Код успешно применён!');
    }

    private getWebviewContent(): string {
        return `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ollama Code Fixer Chat</title>
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
                <h1>🦙 Ollama Code Fixer</h1>
                <p>Задайте вопрос или выберите готовую подсказку</p>
            </div>

            <div class="prompts-section">
                <div class="prompts-title">Быстрые подсказки:</div>
                <div class="prompt-buttons">
                    <button class="prompt-btn" onclick="insertPrompt('Исправь ошибки в этом коде')">🔧 Исправить ошибки</button>
                    <button class="prompt-btn" onclick="insertPrompt('Оптимизируй этот код для лучшей производительности')">⚡ Оптимизировать</button>
                    <button class="prompt-btn" onclick="insertPrompt('Добавь комментарии к этому коду')">📝 Добавить комментарии</button>
                    <button class="prompt-btn" onclick="insertPrompt('Рефактори этот код для лучшей читаемости')">🔄 Рефакторинг</button>
                    <button class="prompt-btn" onclick="insertPrompt('Найди потенциальные уязвимости в коде')">🔒 Проверить безопасность</button>
                    <button class="prompt-btn" onclick="insertPrompt('Создай unit тесты для этого кода')">🧪 Создать тесты</button>
                    <button class="prompt-btn" onclick="insertPrompt('Объясни что делает этот код')">❓ Объяснить код</button>
                </div>
            </div>

            <div class="chat-container" id="chatContainer">
                <div class="message assistant">
                    <div>Привет! Я помогу вам с анализом и исправлением кода. Выберите готовую подсказку выше или задайте свой вопрос.</div>
                    <div class="message-time">${new Date().toLocaleTimeString()}</div>
                </div>
            </div>

            <div class="input-section">
                <div class="input-container">
                    <textarea 
                        class="message-input" 
                        id="messageInput" 
                        placeholder="Введите ваш вопрос или вставьте код..."
                        rows="1"
                    ></textarea>
                    <button class="send-btn" id="sendBtn" onclick="sendMessage()">Отправить</button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
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
                               '<button class="code-btn" onclick="copyCode(this)">Копировать</button>' +
                               '<button class="code-btn" onclick="applyCode(this)">Применить</button>' +
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
                            '<div>Ollama обрабатывает запрос...</div>' +
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
                    button.textContent = 'Скопировано!';
                    setTimeout(() => {
                        button.textContent = 'Копировать';
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
    }

    public dispose() {
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
        this._panel?.dispose();
        this._panel = undefined;
    }
}

// Добавьте в ваш основной файл extension.ts:
/*
import { OllamaCodeFixerChatProvider } from './chatProvider';

// В функции activate добавьте:
const chatProvider = new OllamaCodeFixerChatProvider(context.extensionUri);

// Регистрируем команду для открытия чата
let disposableChat = vscode.commands.registerCommand('ollama-code-fixer.openChat', () => {
    chatProvider.show();
});

context.subscriptions.push(disposableChat);
*/