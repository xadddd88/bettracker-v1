const CHUNK_SIZE = 1_500;

export interface KeyValueBackend {
  deleteItemAsync(key: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export function splitSecureValue(value: string, chunkSize = CHUNK_SIZE): string[] {
  if (chunkSize < 1) throw new Error('Chunk size must be positive');
  if (!value) return [''];
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
}

function slotPrefix(key: string, slot: '0' | '1') {
  return `${key}.slot.${slot}`;
}

async function clearSlot(backend: KeyValueBackend, key: string, slot: '0' | '1') {
  const prefix = slotPrefix(key, slot);
  const rawManifest = await backend.getItemAsync(`${prefix}.manifest`);
  const chunks = rawManifest ? Number.parseInt(rawManifest, 10) : 0;
  if (Number.isFinite(chunks) && chunks > 0 && chunks < 100) {
    await Promise.all(
      Array.from({ length: chunks }, (_, index) => backend.deleteItemAsync(`${prefix}.${index}`)),
    );
  }
  await backend.deleteItemAsync(`${prefix}.manifest`);
}

export function createChunkedStorage(backend: KeyValueBackend) {
  return {
    async getItem(key: string): Promise<string | null> {
      const active = await backend.getItemAsync(`${key}.active`);
      if (active !== '0' && active !== '1') return null;

      const prefix = slotPrefix(key, active);
      const rawManifest = await backend.getItemAsync(`${prefix}.manifest`);
      const chunkCount = rawManifest ? Number.parseInt(rawManifest, 10) : 0;
      if (!Number.isFinite(chunkCount) || chunkCount < 1 || chunkCount > 99) return null;

      const chunks = await Promise.all(
        Array.from({ length: chunkCount }, (_, index) => backend.getItemAsync(`${prefix}.${index}`)),
      );
      if (chunks.some((chunk) => chunk === null)) return null;
      return chunks.join('');
    },

    async setItem(key: string, value: string): Promise<void> {
      const current = await backend.getItemAsync(`${key}.active`);
      const next: '0' | '1' = current === '0' ? '1' : '0';
      const chunks = splitSecureValue(value);
      const prefix = slotPrefix(key, next);

      await clearSlot(backend, key, next);
      await Promise.all(
        chunks.map((chunk, index) => backend.setItemAsync(`${prefix}.${index}`, chunk)),
      );
      await backend.setItemAsync(`${prefix}.manifest`, String(chunks.length));
      await backend.setItemAsync(`${key}.active`, next);

      if (current === '0' || current === '1') await clearSlot(backend, key, current);
    },

    async removeItem(key: string): Promise<void> {
      await Promise.all([clearSlot(backend, key, '0'), clearSlot(backend, key, '1')]);
      await backend.deleteItemAsync(`${key}.active`);
    },
  };
}
