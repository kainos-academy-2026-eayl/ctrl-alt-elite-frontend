import { escapeHtml } from './customerViews';

export const THEME_STORAGE_KEY = 'admin.theme';
export const HIDDEN_WIDGETS_STORAGE_KEY = 'admin.hiddenWidgets';

export type Theme = 'light' | 'dark';

export const DASHBOARD_WIDGETS = [
  { id: 'customerCount', label: 'Show Customer Count' },
  { id: 'recentActivity', label: 'Show Recent Activity' },
  { id: 'notifications', label: 'Show Notifications' },
  { id: 'systemStatus', label: 'Show System Status' },
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]['id'];

// Preferences live in the browser because there is no backend to store them.
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PreferenceRoot {
  dataset: Record<string, string | undefined>;
}

function isWidgetId(value: unknown): value is DashboardWidgetId {
  return DASHBOARD_WIDGETS.some((widget) => widget.id === value);
}

// Storage can be missing or throw (private browsing), so every access is guarded.
function readItem(storage: PreferenceStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(storage: PreferenceStorage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // The preference still applies to the current page.
  }
}

export function readTheme(storage: PreferenceStorage): Theme {
  return readItem(storage, THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function saveTheme(storage: PreferenceStorage, theme: Theme): void {
  writeItem(storage, THEME_STORAGE_KEY, theme);
}

export function readHiddenWidgets(
  storage: PreferenceStorage,
): DashboardWidgetId[] {
  const stored = readItem(storage, HIDDEN_WIDGETS_STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isWidgetId) : [];
  } catch {
    return [];
  }
}

export function saveHiddenWidgets(
  storage: PreferenceStorage,
  hidden: readonly DashboardWidgetId[],
): void {
  writeItem(storage, HIDDEN_WIDGETS_STORAGE_KEY, JSON.stringify(hidden));
}

// The stylesheet reacts to these attributes, so applying a preference is just
// setting data attributes on the root element.
export function applyTheme(root: PreferenceRoot, theme: Theme): void {
  root.dataset.theme = theme;
}

export function applyHiddenWidgets(
  root: PreferenceRoot,
  hidden: readonly DashboardWidgetId[],
): void {
  root.dataset.hiddenWidgets = hidden.join(' ');
}

export function applyPreferences(
  root: PreferenceRoot,
  storage: PreferenceStorage,
): void {
  applyTheme(root, readTheme(storage));
  applyHiddenWidgets(root, readHiddenWidgets(storage));
}

export const BACKEND_STATUS_PATH = '/api/customers?page=1&pageSize=1';
export const STATUS_UNAVAILABLE_TEXT = 'Unavailable';

export interface SystemStatuses {
  backend: ServiceStatus;
  database: ServiceStatus;
}

export interface ServiceStatus {
  text: string;
  ok: boolean;
}

// A successful customer query proves the backend and its database are both up.
// Never throws: an unreachable backend is a result, not an error.
export async function loadSystemStatuses(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = 3000,
): Promise<{ available: boolean; statuses: SystemStatuses }> {
  try {
    const response = await fetchImpl(BACKEND_STATUS_PATH, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) {
      return {
        available: true,
        statuses: {
          backend: { text: 'Operational', ok: true },
          database: { text: 'Connected', ok: true },
        },
      };
    }
  } catch (error) {
    console.error('Unable to load system status:', error);
  }
  const unavailable = { text: STATUS_UNAVAILABLE_TEXT, ok: false };
  return {
    available: false,
    statuses: { backend: unavailable, database: unavailable },
  };
}

export function renderStatusBadge(status: ServiceStatus): string {
  return `<span class="admin-status-badge ${status.ok ? 'is-ok' : 'is-error'}">${escapeHtml(status.text)}</span>`;
}
