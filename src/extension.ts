import * as vscode from 'vscode';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { OllamaCodeFixerChatProvider } from './chatProvider';
import { RetryManager } from './utils/retry';

// Интерфейс для ответа Ollama (упрощенный)
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// Функция для получения или дефолтного значения настройки
function getConfigOrThrow<T>(key: string, defaultValue?: T): T {
  const value = vscode.workspace.getConfiguration('ollamaCodeFixer').get<T>(key);
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing configuration: ollamaCodeFixer.${key}`);
  }
  return value;
}

async function getCorrectionFromOllama(
  codeSnippet: string,
  languageId: string
): Promise<string | null> {
  const config = vscode.workspace.getConfiguration('ollamaCodeFixer');
  const apiUrl = getConfigOrThrow<string>('ollamaApiUrl', 'http://localhost:11434/api/generate');
  const modelName = getConfigOrThrow<string>('modelName', 'gemma:4b');
  const requestTimeout = getConfigOrThrow<number>('requestTimeout', 90000);
  const enableNotifications = getConfigOrThrow<boolean>('enableNotifications', true);
  const logLevel = getConfigOrThrow<string>('logLevel', 'info');
  const retryManager = new RetryManager();

  const promptStructure = getConfigOrThrow<{ prefix: string; suffix: string }>(
    'promptStructure',
    {
      prefix: "[INST] You are an expert AI programming assistant. Your task is to analyze the provided code snippet, identify any errors or areas for improvement, and return *only* the corrected and optimized code block. Do not include any explanations, apologies, or markdown formatting around the code block itself unless the language implies it (like for markdown file corrections). If the code is already perfect or no changes are needed, return the original code snippet as is.\n\nLanguage: {language}\n\nProblematic Code Snippet:\n```\n",
      suffix: "\n```\n[/INST]\nCorrected Code Snippet:\n```\n"
    }
  );

  let prompt = promptStructure.prefix.replace('{language}', languageId);
  prompt += codeSnippet;
  prompt += promptStructure.suffix;

  if (logLevel === 'debug') {
    console.log(`[OllamaCodeFixer] Sending to ${modelName}. Prompt (first 500 chars):\n${prompt.substring(0, 500)}...`);
  }

  try {
    // Используем RetryManager для повторных попыток при ошибках
    const response: AxiosResponse<OllamaGenerateResponse> = await retryManager.withRetry(
      async () => axios.post(
        apiUrl,
        {
          model: modelName,
          prompt: prompt,
          stream: false,
        },
        { timeout: requestTimeout }
      )
    );

    let correctedCode = response.data.response.trim();

    if (logLevel === 'debug') {
      console.log(`[OllamaCodeFixer] Raw response from model:\n${correctedCode}`);
    }

    const codeBlockRegex = /```(?:\w*\n)?([\s\S]*?)```$/;
    const match = correctedCode.match(codeBlockRegex);

    if (match && match[1]) {
      correctedCode = match[1].trim();
      if (logLevel === 'debug') {
        console.log(`[OllamaCodeFixer] Extracted code from block:\n${correctedCode}`);
      }
    } else {
      if (logLevel === 'debug') {
        console.log(`[OllamaCodeFixer] No final code block detected, using trimmed response directly.`);
      }
    }

    return correctedCode;

  } catch (error) {
    let errorMessage: string;
    
    if (error instanceof AxiosError) {
      if (error.response) {
        errorMessage = `Error calling Ollama API: ${error.message}. Status: ${error.response.status}`;
        if (error.response.data) {
          errorMessage += `. Data: ${JSON.stringify(error.response.data)}`;
        }
      } else if (error.request) {
        errorMessage = 'No response received from Ollama. Please check if the service is running and accessible.';
      } else {
        errorMessage = `Error configuring request: ${error.message}`;
      }
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Could not connect to Ollama server. Please ensure the service is running.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Request to Ollama server timed out. The server might be overloaded.';
      }
      
      if (logLevel === 'debug') {
        console.error('[OllamaCodeFixer] API Call Error:', {
          message: error.message,
          code: error.code,
          config: error.config,
          response: error.response?.data
        });
      }
    } else if (error instanceof Error) {
      errorMessage = `Unexpected error: ${error.message}`;
      console.error('[OllamaCodeFixer] Unexpected Error:', error);
    } else {
      errorMessage = 'An unknown error occurred';
      console.error('[OllamaCodeFixer] Unknown Error:', error);
    }
    
    if (enableNotifications) {
      vscode.window.showErrorMessage(errorMessage);
    }
    
    return null;
  }
}

// Элемент для боковой панели
class FixerTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.command = command;
  }
}

// Провайдер для боковой панели с интерактивными элементами
class OllamaCodeFixerViewProvider implements vscode.TreeDataProvider<FixerTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FixerTreeItem | undefined | null | void> = new vscode.EventEmitter<FixerTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FixerTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  getTreeItem(element: FixerTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FixerTreeItem): Thenable<FixerTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    return Promise.resolve([
      new FixerTreeItem(
        'Run Fixer',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'ollama-code-fixer.fixSelectedCode',
          title: 'Run Fixer'
        }
      ),
      new FixerTreeItem(
        'Open Chat',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'ollama-code-fixer.openChat',
          title: 'Open Chat'
        }
      ),
      new FixerTreeItem(
        'Check API Status',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'ollama-code-fixer.checkApiStatus',
          title: 'Check API Status'
        }
      ),
      new FixerTreeItem(
        'Settings',
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'workbench.action.openSettings',
          title: 'Open Settings',
          arguments: ['ollamaCodeFixer']
        }
      )
    ]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log("[OllamaCodeFixer] Extension activated.");

  // Статусная строка
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = 'Ollama: Checking...';
  statusBarItem.show();

  const retryManager = new RetryManager();
  const config = vscode.workspace.getConfiguration('ollamaCodeFixer');
  let baseUrl = config.get<string>('ollamaApiUrl', 'http://localhost:11434');

  try {
    const urlObj = new URL(baseUrl);
    baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  } catch (e) {
    console.error("[OllamaCodeFixer] Invalid ollamaApiUrl, using default base.", e);
    baseUrl = 'http://localhost:11434';
  }

  // Периодическая проверка статуса API
  const checkApiStatus = async () => {
    try {
      await retryManager.withRetry(async () => axios.get(baseUrl, { timeout: 5000 }));
      statusBarItem.text = 'Ollama: Active';
      statusBarItem.tooltip = 'Ollama API is running';
      statusBarItem.backgroundColor = undefined;
    } catch (error) {
      statusBarItem.text = 'Ollama: Offline';
      statusBarItem.tooltip = 'Ollama API is not accessible';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

      if (error instanceof AxiosError) {
        console.error('[OllamaCodeFixer] API Status Check Error:', {
          message: error.message,
          code: error.code,
          response: error.response?.status
        });
      }
    }
  };

  // Выполняем первоначальную проверку
  checkApiStatus();

  // Настраиваем периодическую проверку каждые 30 секунд
  const statusCheckInterval = setInterval(checkApiStatus, 30000);

  // Регистрация представления в боковой панели
  const provider = new OllamaCodeFixerViewProvider();
  vscode.window.registerTreeDataProvider('ollamaCodeFixerView', provider);

  // Инициализация чат-провайдера
  const chatProvider = new OllamaCodeFixerChatProvider(context.extensionUri);

  // Команда для исправления кода
  let disposableFix = vscode.commands.registerCommand('ollama-code-fixer.fixSelectedCode', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active text editor.');
      return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      vscode.window.showInformationMessage('No text selected. Please select the code to fix.');
      return;
    }

    const selectedText = editor.document.getText(selection);
    const languageId = editor.document.languageId;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Ollama Code Fixer',
        cancellable: true,
      },
      async (progress, token) => {
        token.onCancellationRequested(() => {
          console.log('[OllamaCodeFixer] User cancelled the Ollama request.');
          vscode.window.showInformationMessage('Ollama code correction cancelled.');
        });

        progress.report({ increment: 0, message: 'Sending code to local Ollama AI...' });

        if (token.isCancellationRequested) {
          return;
        }

        const correctedCode = await getCorrectionFromOllama(selectedText, languageId);

        if (token.isCancellationRequested) {
          return;
        }

        if (correctedCode === null) {
          return;
        }

        if (correctedCode === selectedText) {
          vscode.window.showInformationMessage('Ollama AI suggests no changes to the selected code.');
          progress.report({ increment: 100, message: 'No changes suggested.' });
          return;
        }

        progress.report({ increment: 80, message: 'Applying AI suggestions...' });

        const currentEditor = vscode.window.activeTextEditor;
        const currentSelection = currentEditor?.selection;

        if (currentEditor && currentEditor.document === editor.document && currentSelection && currentSelection.isEqual(selection)) {
          currentEditor
            .edit(editBuilder => {
              editBuilder.replace(selection, correctedCode);
            })
            .then(success => {
              if (success) {
                vscode.window.showInformationMessage('Code updated by Ollama AI!');
                console.log('[OllamaCodeFixer] Code replacement successful.');
              } else {
                vscode.window.showErrorMessage('Failed to apply code changes.');
                console.log('[OllamaCodeFixer] Code replacement failed.');
              }
            }, (editError) => {
              vscode.window.showErrorMessage(`Failed to apply edits: ${editError.message || editError}`);
              console.error('[OllamaCodeFixer] Edit operation failed:', editError);
            });
        } else {
          vscode.window.showWarningMessage(
            'Editor selection or focus changed during AI processing. Suggestion not applied automatically.'
          );
          console.warn('[OllamaCodeFixer] Selection/focus changed, correction not applied. Suggested code:\n' + correctedCode);
        }
        progress.report({ increment: 100, message: 'Finished.' });
      }
    );
  });

  // Команда для проверки статуса API
  let disposableCheckApi = vscode.commands.registerCommand('ollama-code-fixer.checkApiStatus', async () => {
    let baseUrl = getConfigOrThrow<string>('ollamaApiUrl', 'http://localhost:11434');
    
    try {
      const urlObj = new URL(baseUrl);
      baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    } catch (e) {
      console.error("[OllamaCodeFixer] Invalid ollamaApiUrl for health check, using default base.", e);
      baseUrl = 'http://localhost:11434';
    }

    console.log(`[OllamaCodeFixer] Checking API status at: ${baseUrl}`);

    const retryManager = new RetryManager();

    try {
      await retryManager.withRetry(async () => {
        return axios.get(baseUrl, { timeout: 5000 });
      });
      
      vscode.window.showInformationMessage('Ollama API is accessible! Base URL check successful.');
    } catch (error) {
      let statusMessage = 'Ollama API is not accessible.';
      
      if (error instanceof AxiosError) {
        if (error.response) {
          statusMessage += ` Status: ${error.response.status}`;
        } else if (error.request) {
          statusMessage += ' No response received.';
        } else {
          statusMessage += ` Error: ${error.message}`;
        }
      } else {
        statusMessage += ' Unknown error occurred.';
      }
      
      console.error('[OllamaCodeFixer] checkApiStatus Error:', error);
      vscode.window.showErrorMessage(statusMessage);
    }
  });

  // Команда для открытия чата
  let disposableChat = vscode.commands.registerCommand('ollama-code-fixer.openChat', () => {
    chatProvider.show();
  });

  context.subscriptions.push(
    disposableFix,
    disposableCheckApi,
    disposableChat,
    statusBarItem,
    { dispose: () => clearInterval(statusCheckInterval) }
  );
}

export function deactivate() {
  console.log("[OllamaCodeFixer] Extension deactivated.");
}