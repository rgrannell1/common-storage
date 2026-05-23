// Event streaming — tails an event topic indefinitely, polling for new writes
// @work.md

import type { EventEntry } from "../../capabilities.ts";
import type { StoredTopic, StoredEvent } from "../../types/stored-types.ts";
import { KV_TOPIC, KV_EVENT } from "../../keys.ts";
import { waitForPoll } from "../base.ts";

export async function* streamEvents(kv: Deno.Kv, topic: string, startId: number, signal: AbortSignal): AsyncGenerator<EventEntry> {
  const meta = await kv.get<StoredTopic>([...KV_TOPIC, topic]);
  if (!meta.value) return;

  let nextId = startId;

  while (!signal.aborted) {
    const prefix = [...KV_EVENT, topic];
    const selector = nextId > 1
      ? { prefix, start: [...KV_EVENT, topic, nextId] }
      : { prefix };

    let yieldedAny = false;
    for await (const item of kv.list<StoredEvent>(selector)) {
      if (signal.aborted) return;
      yield item.value;
      nextId = item.value.id + 1;
      yieldedAny = true;
    }

    if (!yieldedAny) {
      await waitForPoll(signal);
    }
  }
}
