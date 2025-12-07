import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import { resolveScheme } from 'expo-linking';

const fallbackConfig = {
  name: 'xbuild',
  slug: 'xbuild',
  scheme: 'expotest',
  ios: {
    bundleIdentifier: 'com.insightfull.Xbuild',
  },
};

// Merge any existing config (from native) with our required fields, ensuring a scheme is present.
const existingConfig = (Constants.expoConfig as Record<string, unknown> | null | undefined) ?? {};
const hasScheme = Boolean(
  (existingConfig as any).scheme ||
    (existingConfig as any)?.ios?.scheme ||
    (existingConfig as any)?.android?.scheme,
);

const mergedConfig = {
  ...fallbackConfig,
  ...existingConfig,
  // Ensure scheme is present even if native config lacks it
  scheme: hasScheme ? (existingConfig as any).scheme : fallbackConfig.scheme,
};

// Always set the raw manifest to the merged config so expo-linking can read the scheme.
(Constants as any).__rawManifest_TEST = mergedConfig as any;

// Some RN/Expo bits read legacy properties; patch them defensively if writable.
try {
  Object.defineProperty(Constants, 'manifest', { value: mergedConfig });
  Object.defineProperty(Constants, 'manifest2', { value: null });
  Object.defineProperty(Constants, 'expoConfig', { value: mergedConfig });
} catch (_) {
  // noop
}

if (!hasScheme) {
  console.info('[xbuild] Applied fallback Expo manifest with scheme', mergedConfig);
} else {
  console.info('[xbuild] Verified Expo manifest has scheme', mergedConfig);
}

if (Constants.executionEnvironment !== ExecutionEnvironment.Bare) {
  (Constants as any).executionEnvironment = ExecutionEnvironment.Bare;
}

// Ensure expo-linking sees a scheme even if native config is missing it.
const probeResolveScheme = () => {
  try {
    resolveScheme({ isSilent: true });
  } catch (error) {
    if (__DEV__) {
      console.warn('[xbuild] resolveScheme failed, re-applying fallback config', error);
    }
    // Reapply in case the manifest was empty when the first probe ran.
    (Constants as any).__rawManifest_TEST = mergedConfig as any;
  }
};

probeResolveScheme();

// Last-resort guard: if expo-linking still throws for missing scheme, inject the fallback scheme.
const originalCreateURL = Linking.createURL;
const patchedCreateURL = (path: string, options?: Record<string, any>) => {
  try {
    return originalCreateURL(path, options as any);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message?.includes('no custom scheme defined')
    ) {
      (Constants as any).__rawManifest_TEST = mergedConfig as any;
      return originalCreateURL(path, { ...options, scheme: mergedConfig.scheme } as any);
    }
    throw error;
  }
};

const createURLDescriptor = Object.getOwnPropertyDescriptor(Linking, 'createURL');
const canPatchCreateURL =
  !createURLDescriptor ||
  createURLDescriptor.writable ||
  typeof createURLDescriptor.set === 'function' ||
  createURLDescriptor.configurable;

if (canPatchCreateURL) {
  try {
    Object.defineProperty(Linking, 'createURL', {
      value: patchedCreateURL,
      configurable: createURLDescriptor?.configurable ?? true,
      writable: createURLDescriptor?.writable ?? true,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[xbuild] Failed to patch Linking.createURL', error);
    }
  }
} else if (__DEV__) {
  console.warn('[xbuild] Linking.createURL is not writable; skipping patch');
}
