/**
 * Runs async tasks one at a time, in submission order. RoomCore puts every storage operation
 * through one queue so stored turns, snapshots and prunes happen in turn order.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly onError: (err: unknown) => void = () => {}) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch((err: unknown) => this.onError(err));
    return result;
  }

  /** Resolves when every task submitted so far has finished. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }
}
