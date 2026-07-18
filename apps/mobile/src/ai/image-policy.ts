export type CaptureMode = 'coupon' | 'event';

export type JpegProfile = {
  compress: number;
  maxDimension: number;
};

export type RenderedJpeg = {
  base64: string;
  height: number;
  uri: string;
  width: number;
};

export type PreparedImage = RenderedJpeg & {
  bodyBytes: number;
  contentType: 'image/jpeg';
  profile: JpegProfile;
};

export type PreparationResult =
  | { status: 'ready'; image: PreparedImage }
  | { status: 'corrupt' }
  | { status: 'oversize' };

export const MAX_ANALYZE_JSON_BYTES = 4_400_000;

export const JPEG_PROFILES: readonly JpegProfile[] = [
  { maxDimension: 2048, compress: 0.82 },
  { maxDimension: 1600, compress: 0.7 },
  { maxDimension: 1280, compress: 0.58 },
  { maxDimension: 1024, compress: 0.48 },
];

export function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

export function analysisBodyByteLength(mode: CaptureMode, base64: string): number {
  return utf8ByteLength(JSON.stringify({
    mode,
    image: {
      contentType: 'image/jpeg',
      base64,
    },
  }));
}

export function resizeWithin(
  width: number,
  height: number,
  maxDimension: number,
): { width: number } | { height: number } | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxDimension) ||
    width <= 0 ||
    height <= 0 ||
    maxDimension <= 0
  ) {
    return null;
  }

  if (Math.max(width, height) <= maxDimension) return null;
  return width >= height ? { width: maxDimension } : { height: maxDimension };
}

export async function prepareWithProfiles(
  mode: CaptureMode,
  renderProfile: (profile: JpegProfile) => Promise<RenderedJpeg>,
): Promise<PreparationResult> {
  for (const profile of JPEG_PROFILES) {
    let rendered: RenderedJpeg;

    try {
      rendered = await renderProfile(profile);
    } catch {
      return { status: 'corrupt' };
    }

    if (
      !rendered.base64 ||
      !rendered.uri ||
      !Number.isFinite(rendered.width) ||
      !Number.isFinite(rendered.height) ||
      rendered.width <= 0 ||
      rendered.height <= 0
    ) {
      return { status: 'corrupt' };
    }

    const bodyBytes = analysisBodyByteLength(mode, rendered.base64);
    if (bodyBytes <= MAX_ANALYZE_JSON_BYTES) {
      return {
        status: 'ready',
        image: {
          ...rendered,
          bodyBytes,
          contentType: 'image/jpeg',
          profile: { ...profile },
        },
      };
    }
  }

  return { status: 'oversize' };
}
