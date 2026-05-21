// Shared cron helper — wraps Deno.cron with an AbortController for clean shutdown.

// Registers a named cron and returns a function that cancels it.
export function startCron(name: string, schedule: string, fn: () => Promise<void>): () => void {
  const controller = new AbortController();
  void Deno.cron(name, schedule, { signal: controller.signal }, fn);
  return () => controller.abort();
}
