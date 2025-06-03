import * as vscode from 'vscode';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Ollama Code Fixer');
        this.logLevel = this.getConfiguredLogLevel();
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private getConfiguredLogLevel(): LogLevel {
        const config = vscode.workspace.getConfiguration('ollamaCodeFixer');
        const level = config.get<string>('logLevel', 'info');
        switch (level.toLowerCase()) {
            case 'debug':
                return LogLevel.DEBUG;
            case 'info':
                return LogLevel.INFO;
            case 'warn':
                return LogLevel.WARN;
            case 'error':
                return LogLevel.ERROR;
            default:
                return LogLevel.INFO;
        }
    }

    private formatMessage(level: string, message: string, data?: any): string {
        const timestamp = new Date().toISOString();
        let formattedMessage = `[${timestamp}] [${level}] ${message}`;
        
        if (data) {
            if (data instanceof Error) {
                formattedMessage += `\nError: ${data.message}`;
                if (data.stack) {
                    formattedMessage += `\nStack: ${data.stack}`;
                }
            } else {
                try {
                    formattedMessage += `\nData: ${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    formattedMessage += `\nData: ${data}`;
                }
            }
        }
        
        return formattedMessage;
    }

    private log(level: LogLevel, levelStr: string, message: string, data?: any) {
        if (level <= this.logLevel) {
            const formattedMessage = this.formatMessage(levelStr, message, data);
            this.outputChannel.appendLine(formattedMessage);
        }
    }

    public error(message: string, data?: any) {
        this.log(LogLevel.ERROR, 'ERROR', message, data);
    }

    public warn(message: string, data?: any) {
        this.log(LogLevel.WARN, 'WARN', message, data);
    }

    public info(message: string, data?: any) {
        this.log(LogLevel.INFO, 'INFO', message, data);
    }

    public debug(message: string, data?: any) {
        this.log(LogLevel.DEBUG, 'DEBUG', message, data);
    }

    public show() {
        this.outputChannel.show();
    }

    public updateLogLevel() {
        this.logLevel = this.getConfiguredLogLevel();
        this.info('Log level updated:', this.logLevel);
    }

    public dispose() {
        this.outputChannel.dispose();
    }
}
