// localization.ts
import * as vscode from 'vscode';

interface LocaleStrings {
    [key: string]: {
        // Common
        chatTitle: string;
        welcomeMessage: string;
        sendButton: string;
        inputPlaceholder: string;
        loadingMessage: string;
        copyButton: string;
        applyButton: string;
        understood: string;
        codeAppliedSuccess: string;
        
        // Quick prompts
        quickPromptsTitle: string;
        fixErrorsPrompt: string;
        optimizePrompt: string;
        addCommentsPrompt: string;
        refactorPrompt: string;
        checkSecurityPrompt: string;
        createTestsPrompt: string;
        explainCodePrompt: string;
        
        // Model selection
        selectModel: string;
        modelNotInstalled: string;
        installModel: string;
        changeModel: string;
        modelInstallStarted: string;
        modelInstallProgress: string;
        pleaseWait: string;
        selectAvailableModel: string;
        
        // Errors and API
        error: string;
        unknownError: string;
        noActiveEditor: string;
        noSelection: string;
        apiError: string;
        invalidUrl: string;
        ollamaApiError: string;
        
        // Settings
        settings: string;
        temperature: string;
        maxTokens: string;
        topP: string;
        topK: string;
        language: string;
        contextTokens: string;
        repeatPenalty: string;
        presencePenalty: string;
        frequencyPenalty: string;
        mirostat: string;
        mirostatTau: string;
        mirostatEta: string;
        model: string;

        // Error handling and retry messages
        retryAttempt: string;
        retryFailed: string;
        checkConnection: string;
        serverTimeout: string;
        serverOverloaded: string;
        networkError: string;
        modelError: string;
        modelCheckFailed: string;
    };
}

const strings: LocaleStrings = {    'en': {
        // Common
        chatTitle: '🦙 Ollama Code Fixer',
        welcomeMessage: 'Hello! I can help you analyze and fix code. Choose a quick prompt above or ask your question.',
        sendButton: 'Send',
        inputPlaceholder: 'Enter your question or paste code...',
        loadingMessage: 'Ollama is processing request...',
        copyButton: 'Copy',
        applyButton: 'Apply',
        understood: 'Got it',        codeAppliedSuccess: 'Code applied successfully!',
        
        // Quick prompts
        quickPromptsTitle: 'Quick Prompts:',
        fixErrorsPrompt: '🔧 Fix Errors',
        optimizePrompt: '⚡ Optimize',
        addCommentsPrompt: '📝 Add Comments',
        refactorPrompt: '🔄 Refactor',
        checkSecurityPrompt: '🔒 Check Security',
        createTestsPrompt: '🧪 Create Tests',
        explainCodePrompt: '❓ Explain Code',
        
        // Model selection
        selectModel: 'Select Model',
        modelNotInstalled: 'Model "{0}" is not installed.',
        installModel: 'Install Model',
        changeModel: 'Change Model',
        modelInstallStarted: 'Started installing model {0}.',
        modelInstallProgress: 'Installing model {0}. Please wait for completion in terminal.',
        pleaseWait: 'Please try again after installation completes.',
        selectAvailableModel: 'Select available model',
        
        // Errors
        error: 'Error',
        unknownError: 'Unknown error occurred',
        noActiveEditor: 'No active editor',
        noSelection: 'No text selected',
        apiError: 'API Error',
        invalidUrl: 'Invalid URL',
        ollamaApiError: 'Ollama API Error: {0}',
        
        // Settings
        settings: 'Settings',
        temperature: 'Temperature',
        maxTokens: 'Max Tokens',
        topP: 'Top P',
        topK: 'Top K',
        language: 'Language',
        contextTokens: 'Context Length',
        repeatPenalty: 'Repeat Penalty',
        presencePenalty: 'Presence Penalty',
        frequencyPenalty: 'Frequency Penalty',
        mirostat: 'Mirostat',
        mirostatTau: 'Mirostat Tau',
        mirostatEta: 'Mirostat Eta',
        model: 'Model',

        // Error handling and retry messages
        retryAttempt: 'Attempt {0} of {1}. Retrying in {2} seconds...',
        retryFailed: 'All retry attempts failed. Last error: {0}',
        checkConnection: 'Please check your connection to Ollama server',
        serverTimeout: 'Server request timed out',
        serverOverloaded: 'Server is currently overloaded',
        networkError: 'Network connection error',
        modelError: 'Model error: {0}',
        modelCheckFailed: 'Failed to check available models: {0}'
    },    'ru': {
        // Common
        chatTitle: '🦙 Ollama Code Fixer',
        welcomeMessage: 'Привет! Я помогу вам с анализом и исправлением кода. Выберите готовую подсказку выше или задайте свой вопрос.',
        sendButton: 'Отправить',
        inputPlaceholder: 'Введите ваш вопрос или вставьте код...',
        loadingMessage: 'Ollama обрабатывает запрос...',
        copyButton: 'Копировать',
        applyButton: 'Применить',
        understood: 'Понятно',        codeAppliedSuccess: 'Код успешно применён!',
        
        // Quick prompts
        quickPromptsTitle: 'Быстрые подсказки:',
        fixErrorsPrompt: '🔧 Исправить ошибки',
        optimizePrompt: '⚡ Оптимизировать',
        addCommentsPrompt: '📝 Добавить комментарии',
        refactorPrompt: '🔄 Рефакторинг',
        checkSecurityPrompt: '🔒 Проверить безопасность',
        createTestsPrompt: '🧪 Создать тесты',
        explainCodePrompt: '❓ Объяснить код',
        
        // Model selection
        selectModel: 'Выбрать модель',
        modelNotInstalled: 'Модель "{0}" не установлена.',
        installModel: 'Установить модель',
        changeModel: 'Сменить модель',
        modelInstallStarted: 'Начата установка модели {0}.',
        modelInstallProgress: 'Установка модели {0}. Пожалуйста, дождитесь завершения в терминале.',
        pleaseWait: 'Пожалуйста, повторите запрос после завершения установки.',
        selectAvailableModel: 'Выберите доступную модель',
        
        // Errors
        error: 'Ошибка',
        unknownError: 'Произошла неизвестная ошибка',
        noActiveEditor: 'Нет активного редактора',
        noSelection: 'Нет выделенного текста',
        apiError: 'Ошибка API',
        invalidUrl: 'Некорректный URL',
        ollamaApiError: 'Ошибка Ollama API: {0}',
        
        // Settings
        settings: 'Настройки',
        temperature: 'Температура',
        maxTokens: 'Макс. токенов',
        topP: 'Top P',
        topK: 'Top K',
        language: 'Язык',
        contextTokens: 'Длина контекста',
        repeatPenalty: 'Штраф за повторы',
        presencePenalty: 'Штраф за присутствие',
        frequencyPenalty: 'Штраф за частоту',
        mirostat: 'Миростат',
        mirostatTau: 'Тау миростата',
        mirostatEta: 'Эта миростата',
        model: 'Модель',

        // Error handling and retry messages
        retryAttempt: 'Попытка {0} из {1}. Повторная попытка через {2} сек...',
        retryFailed: 'Все попытки выполнить запрос завершились неудачей. Последняя ошибка: {0}',
        checkConnection: 'Пожалуйста, проверьте подключение к серверу Ollama',
        serverTimeout: 'Превышено время ожидания ответа от сервера',
        serverOverloaded: 'Сервер в данный момент перегружен',
        networkError: 'Ошибка сетевого подключения',
        modelError: 'Ошибка модели: {0}',
        modelCheckFailed: 'Не удалось проверить доступные модели: {0}'
    }
};

export function getLocaleStrings(): LocaleStrings[keyof LocaleStrings] {
    const config = vscode.workspace.getConfiguration('ollamaCodeFixer');
    const language = config.get<string>('language', 'en');
    return strings[language] || strings['en'];
}
