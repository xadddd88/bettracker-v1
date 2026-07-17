import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage, type KeyValueBackend } from '@/auth/chunked-storage';

const secureStoreBackend: KeyValueBackend = {
  deleteItemAsync: SecureStore.deleteItemAsync,
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync(key, value) {
    return SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
};

export const secureSessionStorage = createChunkedStorage(secureStoreBackend);
