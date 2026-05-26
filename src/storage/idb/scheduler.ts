// SetIntervalScheduler — browser IScheduler implementation backed by setInterval.

import type { IScheduler } from "../../core/node.ts";

export class SetIntervalScheduler implements IScheduler {
  private readonly handles: Map<string, ReturnType<typeof setInterval>> = new Map();

  schedule(id: string, intervalMs: number, fn: () => Promise<void>): void {
    if (this.handles.has(id)) return;
    const handle = setInterval(() => { fn().catch(err => console.error("[cmstr] unhandled scheduler error", err)); }, intervalMs);
    this.handles.set(id, handle);
  }

  cancelAll(): void {
    for (const handle of this.handles.values()) clearInterval(handle);
    this.handles.clear();
  }
}
