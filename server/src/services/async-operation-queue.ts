/**
 * Serializes async mutations for the Phase 3 Redis runtime.
 *
 * Redis-backed room writes are still plain last-writer-wins `SET`s. Until a
 * future phase introduces cross-instance coordination, we keep the runtime
 * safe by ensuring this process applies room mutations one at a time.
 */
export class AsyncOperationQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation, operation);
    this.tail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}
