import { workspace } from 'vscode';
import { AxiosError } from 'axios';
import { Logger } from './logger';

export interface RetryOptions {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
}

export class RetryManager {
    private readonly options: RetryOptions;
    private readonly logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
        const config = workspace.getConfiguration('ollamaCodeFixer');
        this.options = {
            maxRetries: config.get<number>('maxRetries', 3),
            retryDelay: config.get<number>('retryDelay', 1000),
            backoffMultiplier: config.get<number>('retryBackoffMultiplier', 1.5)
        };
        this.logger.debug('RetryManager initialized with options:', this.options);
    }    async withRetry<T>(
        operation: () => Promise<T>,
        isRetryable: (error: any) => boolean = this.defaultIsRetryable
    ): Promise<T> {
        let lastError: Error | undefined;
        let delay = this.options.retryDelay;

        for (let attempt = 1; attempt <= this.options.maxRetries + 1; attempt++) {
            try {
                this.logger.debug(`Starting attempt ${attempt}/${this.options.maxRetries + 1}`);
                const result = await operation();
                this.logger.debug(`Attempt ${attempt} succeeded`);
                return result;
            } catch (error) {
                lastError = error as Error;
                
                this.logger.error(`Attempt ${attempt} failed:`, {
                    error: lastError,
                    isAxiosError: error instanceof AxiosError,
                    status: (error as AxiosError)?.response?.status,
                    code: (error as AxiosError)?.code
                });
                
                if (attempt <= this.options.maxRetries && isRetryable(error)) {
                    this.logger.info(`Retrying in ${delay}ms... (attempt ${attempt}/${this.options.maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= this.options.backoffMultiplier;
                } else {
                    this.logger.warn(`No more retries after attempt ${attempt}`, {
                        maxRetries: this.options.maxRetries,
                        isRetryable: isRetryable(error)
                    });
                    break;
                }
            }
        }

        throw lastError;
    }    private defaultIsRetryable(error: any): boolean {
        // Повторяем попытку при таймауте, сетевых ошибках или если сервер перегружен
        if (error instanceof AxiosError) {
            // Коды ошибок, которые стоит повторить
            const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
            const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
            
            // Таймаут или нет соединения
            if (!error.response) {
                const shouldRetry = retryableCodes.includes(error.code || '');
                this.logger.debug('Network-level error check:', {
                    code: error.code,
                    shouldRetry
                });
                return shouldRetry;
            }
            
            const shouldRetry = retryableStatusCodes.includes(error.response.status);
            this.logger.debug('HTTP status code check:', {
                status: error.response.status,
                shouldRetry,
                retryableStatusCodes
            });
            return shouldRetry;
        }
        
        this.logger.debug('Non-Axios error, no retry', { error });
        return false;
    }
}
