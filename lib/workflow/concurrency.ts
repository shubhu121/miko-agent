
export function createLimiter({ maxConcurrent, maxTotal }) {
  let active = 0;
  let total = 0;
  /** @type {Array<{ thunk: () => Promise<any>, resolve: Function, reject: Function }>} */
  const queue = [];

  function pump() {
    if (active >= maxConcurrent) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    Promise.resolve()
      .then(job.thunk)
      .then(job.resolve, job.reject)
      .finally(() => { active--; pump(); });
  }

  return {
    /**
     * @template T
     * @param {() => Promise<T>} thunk
     * @returns {Promise<T>}
     */
    run(thunk) {
      total++;
      if (total > maxTotal) {
        return Promise.reject(new Error("This feature is available in English only."));
      }
      return new Promise((resolve, reject) => {
        queue.push({ thunk, resolve, reject });
        pump();
      });
    },
    get activeCount() { return active; },
    get totalSpawned() { return total; },
  };
}
