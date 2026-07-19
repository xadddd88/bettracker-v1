import { File, Paths } from 'expo-file-system';

export function deleteGeneratedImage(uri: string): void {
  try {
    const cachePrefix = Paths.cache.uri.endsWith('/') ? Paths.cache.uri : `${Paths.cache.uri}/`;
    if (!uri.startsWith(cachePrefix)) return;

    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best-effort and must never expose a native path or error.
  }
}
