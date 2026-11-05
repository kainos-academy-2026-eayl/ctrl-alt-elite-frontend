import './i18n';
import { t } from '../i18n/runtime';

const currentYear = document.querySelector('[data-current-year]');

if (currentYear) {
  currentYear.textContent = String(new Date().getFullYear());
}

const accountMenu = document.querySelector<HTMLDetailsElement>(
  '[data-account-menu]',
);

if (accountMenu) {
  document.addEventListener('click', (event) => {
    if (
      !(event.target instanceof Node) ||
      !accountMenu.contains(event.target)
    ) {
      accountMenu.removeAttribute('open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && accountMenu.hasAttribute('open')) {
      accountMenu.removeAttribute('open');
      accountMenu.querySelector('summary')?.focus();
    }
  });
}

async function loadAccountProfile(): Promise<void> {
  const image = document.querySelector<HTMLImageElement>(
    '[data-account-image]',
  );
  const fallback = document.querySelector<SVGElement>(
    '[data-account-fallback]',
  );
  const label = accountMenu?.querySelector<HTMLElement>('.account-name');
  const summary = accountMenu?.querySelector('summary');
  const error = accountMenu?.querySelector<HTMLElement>(
    '[data-account-profile-error]',
  );
  if (!image || !fallback || !label || !summary || !error) return;

  const showError = () => {
    image.hidden = true;
    fallback.removeAttribute('hidden');
    error.hidden = false;
  };
  image.addEventListener('load', () => {
    image.hidden = false;
    fallback.setAttribute('hidden', '');
  });
  image.addEventListener('error', () => {
    console.warn('Unable to display the saved account picture.');
    showError();
  });
  try {
    const response = await fetch('/api/profile', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Profile API returned ${response.status}.`);
    const profile: unknown = await response.json();
    if (
      typeof profile !== 'object' ||
      profile === null ||
      !('username' in profile) ||
      (profile.username !== null && typeof profile.username !== 'string') ||
      !('firstName' in profile) ||
      typeof profile.firstName !== 'string' ||
      !('lastName' in profile) ||
      typeof profile.lastName !== 'string' ||
      !('hasPhoto' in profile) ||
      typeof profile.hasPhoto !== 'boolean'
    ) {
      throw new Error('The saved account profile has an unexpected shape.');
    }
    const name =
      profile.username || `${profile.firstName} ${profile.lastName}`.trim();
    label.textContent = name;
    summary.setAttribute('aria-label', `${name} options`);
    if (profile.hasPhoto) image.src = '/api/profile/photo';
  } catch (failure) {
    console.error('Unable to load the account profile:', failure);
    showError();
  }
}

function profileControl<T extends Element>(selector: string): T {
  const control = document.querySelector<T>(selector);
  if (!control) throw new Error(`Missing profile control: ${selector}`);
  return control;
}

function initialiseProfilePhoto(): void {
  const editor = document.querySelector<HTMLElement>(
    '[data-profile-photo-editor]',
  );
  if (!editor?.querySelector('[data-profile-photo-upload]')) return;
  const input = profileControl<HTMLInputElement>('#profile-picture');
  const upload = profileControl<HTMLButtonElement>(
    '[data-profile-photo-upload]',
  );
  const remove = profileControl<HTMLButtonElement>(
    '[data-profile-photo-remove]',
  );
  const status = profileControl<HTMLElement>('[data-profile-photo-status]');
  const error = profileControl<HTMLElement>('[data-profile-photo-error]');
  const image = profileControl<HTMLImageElement>('[data-profile-image]');
  const fallback = profileControl<SVGElement>('[data-profile-fallback]');
  let hasPhoto = editor.dataset.hasPhoto === 'true';
  let preview: string | null = null;
  let validSelection = false;
  let busy = false;

  const releasePreview = () => {
    if (preview) URL.revokeObjectURL(preview);
    preview = null;
  };
  const showError = (message: string) => {
    error.textContent = message;
    error.hidden = false;
    status.textContent = '';
  };
  const showSaved = () => {
    releasePreview();
    image.alt = t('js.photo.alt');
    image.hidden = !hasPhoto;
    fallback.toggleAttribute('hidden', hasPhoto);
    if (hasPhoto) image.src = `/api/profile/photo?v=${Date.now()}`;
    else image.removeAttribute('src');
  };
  image.addEventListener('error', () => {
    image.hidden = true;
    fallback.removeAttribute('hidden');
    validSelection = false;
    upload.disabled = true;
    showError(t('js.photo.cannotDisplay'));
  });
  if (image.hasAttribute('src') && image.complete && image.naturalWidth === 0) {
    image.hidden = true;
    fallback.removeAttribute('hidden');
    showError(t('js.photo.cannotDisplaySaved'));
  }
  input.addEventListener('change', () => {
    error.hidden = true;
    status.textContent = '';
    validSelection = false;
    upload.disabled = true;
    showSaved();
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showError(t('js.photo.wrongType'));
      return;
    }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      showError(t('js.photo.tooLarge'));
      return;
    }
    preview = URL.createObjectURL(file);
    image.src = preview;
    image.alt = t('js.photo.previewAlt');
    image.hidden = false;
    fallback.setAttribute('hidden', '');
    validSelection = true;
    upload.disabled = busy;
    status.textContent = t('js.photo.previewOnly');
  });

  async function changePhoto(method: 'PUT' | 'DELETE'): Promise<void> {
    const file = input.files?.[0];
    if (busy || (method === 'PUT' && (!file || !validSelection))) return;
    busy = true;
    input.disabled = true;
    upload.disabled = true;
    remove.disabled = true;
    error.hidden = true;
    status.textContent =
      method === 'PUT' ? t('js.photo.uploading') : t('js.photo.removing');
    try {
      const response = await fetch('/api/profile/photo', {
        method,
        ...(method === 'PUT' && file
          ? {
              headers: { 'Content-Type': file.type },
              body: file,
            }
          : {}),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 401 || response.status === 403) {
        window.location.assign('/login');
        return;
      }
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === 'object' &&
          result !== null &&
          'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : t('js.photo.failed');
        throw new Error(message);
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('hasPhoto' in result) ||
        typeof result.hasPhoto !== 'boolean'
      ) {
        throw new Error('The picture API returned an unexpected response.');
      }
      hasPhoto = result.hasPhoto;
      validSelection = false;
      input.value = '';
      remove.hidden = !hasPhoto;
      showSaved();
      status.textContent =
        method === 'PUT' ? t('js.photo.saved') : t('js.photo.removed');
    } catch (failure) {
      showError(
        failure instanceof Error ? failure.message : t('js.photo.failed'),
      );
    } finally {
      busy = false;
      input.disabled = false;
      upload.disabled = !validSelection;
      remove.disabled = false;
    }
  }

  upload.addEventListener('click', () => void changePhoto('PUT'));
  remove.addEventListener('click', () => void changePhoto('DELETE'));
  window.addEventListener('pagehide', releasePreview);
}

void loadAccountProfile();
initialiseProfilePhoto();
