const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runBatchQueue(items, worker, {
  concurrency = 4,
  retries = 1,
  retryDelayMs = 350,
  shouldRetry = () => false,
  onError = (_error, item) => item,
  onProgress = null
} = {}) {
  const safeConcurrency = Math.max(1, Math.floor(Number(concurrency) || 1));
  const safeRetries = Math.max(0, Math.floor(Number(retries) || 0));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runOne(item, index) {
    let attempt = 0;
    while (true) {
      try {
        const result = await worker(item, { index, attempt });
        if (attempt < safeRetries && await shouldRetry(result, item, { index, attempt })) {
          attempt += 1;
          await wait(retryDelayMs * attempt);
          continue;
        }
        return result;
      } catch (error) {
        if (attempt >= safeRetries) return onError(error, item, { index, attempt });
        attempt += 1;
        await wait(retryDelayMs * attempt);
      }
    }
  }

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await runOne(items[index], index);
      if (typeof onProgress === 'function') {
        await onProgress({
          completed: results.filter((item) => item !== undefined).length,
          total: items.length,
          index,
          item: items[index],
          result: results[index]
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeConcurrency, items.length) }, runWorker));
  return results;
}
