
/*
 * Logger interface
 */
export interface ILogger {
  info(message: string, record?: Record<string, any>): void;
  error(message: string, record?: Record<string, any>): void;
}
