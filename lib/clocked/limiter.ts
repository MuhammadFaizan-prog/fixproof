/**
 * A small FIFO concurrency limiter. Clocked publishes account concurrency of
 * 1 (Trial), 4 (Build), 8 (Production), 16 (Scale); a 429 means "wait", never
 * "add parallelism" (docs: Limits & usage).
 */
export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>;
  readonly active: number;
  readonly pending: number;
}

export function createLimiter(concurrency: number): Limiter {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
  }
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= concurrency) return;
    const start = queue.shift();
    if (start) start();
  };

  return {
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
    run<T>(task: () => Promise<T>) {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          active++;
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              next();
            });
        });
        next();
      });
    },
  };
}
