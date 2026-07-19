export type GeneratedImageCleanup = (uri: string) => void;

export class PreparedImageCacheLifecycle {
  private retainedUri: string | null = null;

  constructor(private readonly cleanup: GeneratedImageCleanup) {}

  replace(nextUri: string | null): void {
    const previousUri = this.retainedUri;
    this.retainedUri = nextUri;

    if (previousUri && previousUri !== nextUri) {
      this.cleanup(previousUri);
    }
  }

  clear(): void {
    this.replace(null);
  }
}

export function cleanupUnretainedGeneratedImages(
  generatedUris: readonly string[],
  retainedUri: string | null,
  cleanup: GeneratedImageCleanup,
): void {
  const staleUris = new Set(generatedUris.filter((uri) => uri && uri !== retainedUri));
  for (const uri of staleUris) cleanup(uri);
}
