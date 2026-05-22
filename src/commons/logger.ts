// Logger interface and implementations — StderrLogger for production, NoopLogger for tests

// Structured log data attached to each log line
type LogData = Record<string, unknown>;

export interface ILogger {
  info(message: string, request: Request | undefined, data: LogData): void;
  error(message: string, request: Request | undefined, data: LogData): void;
}

// Formats a log line: "METHOD URL | message | data={...}" or "message | data={...}"
function formatLine(message: string, request: Request | undefined, data: LogData): string {
  const dataStr = `data=${JSON.stringify(data)}`;
  if (request) {
    return `${request.method} ${request.url} | ${message} | ${dataStr}`;
  }
  return `${message} | ${dataStr}`;
}

export class StderrLogger implements ILogger {
  info(message: string, request: Request | undefined, data: LogData): void {
    console.error(`[info] ${formatLine(message, request, data)}`);
  }

  error(message: string, request: Request | undefined, data: LogData): void {
    console.error(`[error] ${formatLine(message, request, data)}`);
  }
}

export class NoopLogger implements ILogger {
  info(_message: string, _request: Request | undefined, _data: LogData): void {}
  error(_message: string, _request: Request | undefined, _data: LogData): void {}
}
