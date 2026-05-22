// CmstrError — thrown by CmstrClient when the server returns an HTTP error
// @work.md

export class CmstrError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.name = "CmstrError";
    this.status = status;
    this.body = body;
  }
}
