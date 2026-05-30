export class KvOpsCounter {
  reads = 0;
  writes = 0;
  lists = 0;
  // Total KV entries yielded across all list() calls — captures scan depth, not just call count.
  listItems = 0;

  drain(): { reads: number; writes: number; lists: number; listItems: number } {
    const snapshot = {
      reads: this.reads,
      writes: this.writes,
      lists: this.lists,
      listItems: this.listItems,
    };
    this.reads = 0;
    this.writes = 0;
    this.lists = 0;
    this.listItems = 0;
    return snapshot;
  }
}
