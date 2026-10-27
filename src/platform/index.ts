/** Picks the platform implementation for the current host, once. */
import { ElectronPlatform } from './electron-platform.ts';
import { WebPlatform } from './web-platform.ts';
import type { Platform } from './platform.ts';

let instance: Platform | null = null;

export function getPlatform(): Platform {
  instance ??= window.bookreaderHost ? new ElectronPlatform(window.bookreaderHost) : new WebPlatform();
  return instance;
}

export type { Platform, BookSource, BookFile, LibraryEntry, OpenRequest } from './platform.ts';
