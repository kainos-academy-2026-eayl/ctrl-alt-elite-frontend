import { applyPreferences } from '../util/adminSettings';

// Loaded in the page head so the saved theme and widget choices apply before
// the first paint.
function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = readStorage();
if (storage) applyPreferences(document.documentElement, storage);
