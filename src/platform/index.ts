/** Picks the platform implementation for the current host, once. */
import { TauriPlatform } from './tauri-platform.ts';
import { WebPlatform } from './web-platform.ts';
import type { Platform } from './platform.ts';

let instance: Platform | null = null;

export function getPlatform(): Platform {
  instance ??= '__TAURI_INTERNALS__' in window ? new TauriPlatform() : new WebPlatform();
  return instance;
}

export type { Platform, BookSource, BookFile, LibraryEntry, OpenRequest } from './platform.ts';
