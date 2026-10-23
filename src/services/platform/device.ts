import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { openAppDatabase } from '@/db';
import { createAppServices } from '../app/createAppServices';
import type { AppServices, ServiceDeps } from '../contracts';
import { createScoringFeedback, type FeedbackPreferences, type ScoringFeedback } from '../feedback/feedback';
import { createExpoFileSystem } from './fileSystem';
import { createExpoHapticsDriver } from './haptics';
import { newSeed, newUuid, sha256, systemClock } from './identity';
import { createExpoPrinter, createExpoSharer } from './output';
import { createWebFileStore } from './webFiles';

function fileDeps(os: string): Pick<ServiceDeps, 'fileSystem' | 'sharer'> {
  if (os === 'web') {
    return createWebFileStore();
  }
  return { fileSystem: createExpoFileSystem(), sharer: createExpoSharer() };
}

export function createDeviceDeps(os: string = Platform.OS): ServiceDeps {
  return {
    openDatabase: () => openAppDatabase(),
    clock: systemClock,
    newId: newUuid,
    newSeed,
    printer: createExpoPrinter(),
    ...fileDeps(os),
  };
}

export function createDeviceServices(): AppServices {
  return createAppServices(createDeviceDeps(), {
    sha256,
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    platform: Platform.OS,
  });
}

export function createDeviceFeedback(preferences: () => FeedbackPreferences): ScoringFeedback {
  return createScoringFeedback({ haptics: createExpoHapticsDriver(), sound: null, preferences });
}
