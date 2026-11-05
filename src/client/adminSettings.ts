import { changePassword, validatePasswordForm } from '../util/adminPassword';
import { updateProfile, validateProfileForm } from '../util/adminProfile';
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
  const inputs = [
    ...document.querySelectorAll<HTMLInputElement>('[data-widget-toggle]'),
  ];
  const showAll = document.querySelector<HTMLButtonElement>(
    '[data-widgets-show-all]',
  );
  const hideAll = document.querySelector<HTMLButtonElement>(
    '[data-widgets-hide-all]',
  );

  function widgetId(input: HTMLInputElement): DashboardWidgetId {
    return input.dataset.widgetToggle as DashboardWidgetId;
  }

  // Each bulk button is disabled once it would change nothing.
  function syncBulkButtons(): void {
    if (showAll) showAll.disabled = inputs.every((input) => input.checked);
    if (hideAll) hideAll.disabled = inputs.every((input) => !input.checked);
  }

  function save(): void {
    const hidden = DASHBOARD_WIDGETS.map((widget) => widget.id).filter((id) =>
      inputs.some((input) => widgetId(input) === id && !input.checked),
    );
    saveHiddenWidgets(storage, hidden);
    applyHiddenWidgets(root, hidden);
    syncBulkButtons();
  }

  function setAll(visible: boolean): void {
    for (const input of inputs) input.checked = visible;
    save();
  }

  const hidden = new Set(readHiddenWidgets(storage));
  for (const input of inputs) {
    input.checked = !hidden.has(widgetId(input));
    input.addEventListener('change', save);
  }
  showAll?.addEventListener('click', () => setAll(true));
  hideAll?.addEventListener('click', () => setAll(false));
  syncBulkButtons();
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

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

function setUpProfileForm(): void {
  // The form is absent when the profile could not be loaded.
  if (!document.querySelector('[data-profile-form]')) return;

  const form = getElement<HTMLFormElement>('[data-profile-form]');
  const details = getElement<HTMLElement>('[data-settings-profile]');
  const editButton = getElement<HTMLButtonElement>('[data-profile-edit]');
  const cancelButton = getElement<HTMLButtonElement>('[data-profile-cancel]');
  const saveButton = getElement<HTMLButtonElement>('[data-profile-save]');
  const error = getElement<HTMLElement>('[data-profile-error]');
  const success = getElement<HTMLElement>('[data-profile-success]');
  const nameText = getElement<HTMLElement>('[data-profile-name]');
  const emailText = getElement<HTMLElement>('[data-profile-email]');
  const nameInput = getElement<HTMLInputElement>('#profile-name');
  const emailInput = getElement<HTMLInputElement>('#profile-email');

  // Editing needs script, so the Edit button only appears once it has loaded.
  editButton.hidden = false;

  function setEditing(editing: boolean): void {
    form.hidden = !editing;
    details.hidden = editing;
    editButton.hidden = editing;
    error.hidden = true;
    if (editing) success.hidden = true;
  }

  editButton.addEventListener('click', () => {
    nameInput.value = nameText.textContent ?? '';
    emailInput.value = emailText.textContent ?? '';
    setEditing(true);
    nameInput.focus();
  });

  cancelButton.addEventListener('click', () => setEditing(false));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = { name: nameInput.value, email: emailInput.value };

    const problem = validateProfileForm(values);
    if (problem) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }

    saveButton.disabled = true;
    const result = await updateProfile(values);
    saveButton.disabled = false;

    if (!result.ok) {
      error.textContent = result.message;
      error.hidden = false;
      return;
    }
    if (result.profile) {
      nameText.textContent = result.profile.name;
      emailText.textContent = result.profile.email;
    }
    setEditing(false);
    success.textContent = result.message;
    success.hidden = false;
  });
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
setUpProfileForm();
setUpPasswordForm();
setUpWidgetPreferences();
void showSystemStatus();
