import { changePassword, validatePasswordForm } from '../util/adminPassword';
import {
  applyHiddenWidgets,
  applyTheme,
  DASHBOARD_WIDGETS,
  type DashboardWidgetId,
  loadSystemStatuses,
  type PreferenceStorage,
  readHiddenWidgets,
  readTheme,
  renderStatusBadge,
  saveHiddenWidgets,
  saveTheme,
} from '../util/adminSettings';

// Storage can be blocked by the browser; preferences then last for this page only.
const memoryStore = new Map<string, string>();
const fallbackStorage: PreferenceStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
};

function getStorage(): PreferenceStorage {
  try {
    return window.localStorage;
  } catch {
    return fallbackStorage;
  }
}

const storage = getStorage();
const root = document.documentElement;

function setUpDarkMode(): void {
  const toggle = document.querySelector<HTMLInputElement>(
    '[data-dark-mode-toggle]',
  );
  if (!toggle) return;
  toggle.checked = readTheme(storage) === 'dark';
  toggle.addEventListener('change', () => {
    const theme = toggle.checked ? 'dark' : 'light';
    saveTheme(storage, theme);
    applyTheme(root, theme);
  });
}

function setUpWidgetPreferences(): void {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    '[data-widget-toggle]',
  );
  const hidden = new Set(readHiddenWidgets(storage));
  for (const input of inputs) {
    const id = input.dataset.widgetToggle as DashboardWidgetId;
    input.checked = !hidden.has(id);
    input.addEventListener('change', () => {
      if (input.checked) hidden.delete(id);
      else hidden.add(id);
      const next = DASHBOARD_WIDGETS.map((widget) => widget.id).filter((key) =>
        hidden.has(key),
      );
      saveHiddenWidgets(storage, next);
      applyHiddenWidgets(root, next);
    });
  }
}

async function showSystemStatus(): Promise<void> {
  const backend = document.querySelector('[data-system-backend]');
  const database = document.querySelector('[data-system-database]');
  const error = document.querySelector<HTMLElement>('[data-system-error]');

  const { available, statuses } = await loadSystemStatuses();
  if (backend) backend.innerHTML = renderStatusBadge(statuses.backend);
  if (database) database.innerHTML = renderStatusBadge(statuses.database);
  if (error) error.hidden = available;
}

function setUpPasswordForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-password-form]');
  const error = document.querySelector<HTMLElement>('[data-password-error]');
  const success = document.querySelector<HTMLElement>(
    '[data-password-success]',
  );
  const submit = document.querySelector<HTMLButtonElement>(
    '[data-password-submit]',
  );
  if (!form || !error || !success || !submit) return;

  function show(element: HTMLElement, message: string): void {
    error?.setAttribute('hidden', '');
    success?.setAttribute('hidden', '');
    element.textContent = message;
    element.removeAttribute('hidden');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const values = {
      currentPassword: String(data.get('currentPassword') ?? ''),
      newPassword: String(data.get('newPassword') ?? ''),
      confirmPassword: String(data.get('confirmPassword') ?? ''),
    };

    const problem = validatePasswordForm(values);
    if (problem) {
      show(error, problem);
      return;
    }

    submit.disabled = true;
    const result = await changePassword(values);
    submit.disabled = false;
    if (result.ok) {
      form.reset();
      show(success, result.message);
    } else {
      show(error, result.message);
    }
  });
}

setUpDarkMode();
setUpPasswordForm();
setUpWidgetPreferences();
void showSystemStatus();
