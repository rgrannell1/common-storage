export interface ILogger {
  info(message: string, record?: Record<string, any>): void;
}
