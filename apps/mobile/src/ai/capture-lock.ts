export type CaptureLock = {
  current: boolean;
};

export async function runWithCaptureLock<T>(
  lock: CaptureLock,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (lock.current) return undefined;

  lock.current = true;
  try {
    return await operation();
  } finally {
    lock.current = false;
  }
}
