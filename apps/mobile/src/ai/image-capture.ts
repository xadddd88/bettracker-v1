import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  prepareWithProfiles,
  resizeWithin,
  type CaptureMode,
  type PreparedImage,
} from './image-policy';

export type CaptureSource = 'camera' | 'library';

export type PreparedCapture = PreparedImage & {
  source: CaptureSource;
};

export type CaptureOutcome =
  | { status: 'ready'; image: PreparedCapture }
  | { status: 'cancelled' }
  | { status: 'permission-denied'; permission: 'camera' | 'photos' }
  | { status: 'corrupt' }
  | { status: 'oversize' };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  allowsMultipleSelection: false,
  base64: false,
  exif: false,
  mediaTypes: ['images'],
  quality: 1,
  selectionLimit: 1,
  shouldDownloadFromNetwork: false,
};

export async function captureFromCamera(mode: CaptureMode): Promise<CaptureOutcome> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return { status: 'permission-denied', permission: 'camera' };
    }

    const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    return await preparePickerResult(mode, 'camera', result);
  } catch {
    return { status: 'corrupt' };
  }
}

export async function captureFromLibrary(mode: CaptureMode): Promise<CaptureOutcome> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { status: 'permission-denied', permission: 'photos' };
    }

    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    return await preparePickerResult(mode, 'library', result);
  } catch {
    return { status: 'corrupt' };
  }
}

async function preparePickerResult(
  mode: CaptureMode,
  source: CaptureSource,
  result: ImagePicker.ImagePickerResult,
): Promise<CaptureOutcome> {
  if (result.canceled) return { status: 'cancelled' };

  const asset = result.assets[0];
  if (
    !asset ||
    !asset.uri ||
    !Number.isFinite(asset.width) ||
    !Number.isFinite(asset.height) ||
    asset.width <= 0 ||
    asset.height <= 0 ||
    (asset.type !== null && asset.type !== undefined && asset.type !== 'image')
  ) {
    return { status: 'corrupt' };
  }

  const prepared = await prepareWithProfiles(mode, async (profile) => {
    const context = ImageManipulator.manipulate(asset.uri);
    const resize = resizeWithin(asset.width, asset.height, profile.maxDimension);
    if (resize) context.resize(resize);

    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      base64: true,
      compress: profile.compress,
      format: SaveFormat.JPEG,
    });

    return {
      base64: saved.base64 ?? '',
      height: saved.height,
      uri: saved.uri,
      width: saved.width,
    };
  });

  if (prepared.status !== 'ready') return prepared;
  return {
    status: 'ready',
    image: {
      ...prepared.image,
      source,
    },
  };
}
