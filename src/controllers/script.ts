const currentYear = document.querySelector('[data-current-year]');

if (currentYear) {
  currentYear.textContent = String(new Date().getFullYear());
}

const dropdowns = Array.from(
  document.querySelectorAll<HTMLDetailsElement>('[data-nav-dropdown]'),
);

function closeDropdowns(except?: HTMLDetailsElement): HTMLDetailsElement[] {
  const closed: HTMLDetailsElement[] = [];
  for (const dropdown of dropdowns) {
    if (dropdown !== except && dropdown.hasAttribute('open')) {
      dropdown.removeAttribute('open');
      closed.push(dropdown);
    }
  }
  return closed;
}

for (const dropdown of dropdowns) {
  dropdown.addEventListener('toggle', () => {
    if (dropdown.open) closeDropdowns(dropdown);
  });
}

document.addEventListener('click', (event) => {
  for (const dropdown of dropdowns) {
    if (!(event.target instanceof Node) || !dropdown.contains(event.target)) {
      dropdown.removeAttribute('open');
    }
  }
});

// The menu button is a checkbox, so it works without this script; the script
// only adds closing with Escape.
const navToggle = document.querySelector<HTMLInputElement>('[data-nav-toggle]');

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const [closed] = closeDropdowns();
  if (closed) {
    closed.querySelector('summary')?.focus();
    return;
  }
  if (navToggle?.checked) {
    navToggle.checked = false;
    navToggle.focus();
  }
});
const accountMenu = document.querySelector<HTMLDetailsElement>(
  '[data-account-menu]',
);

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
    image.alt = 'Your profile picture';
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
    showError(
      'Unable to display this picture. Choose another image or reload the page.',
    );
  });
  if (image.hasAttribute('src') && image.complete && image.naturalWidth === 0) {
    image.hidden = true;
    fallback.removeAttribute('hidden');
    showError(
      'Unable to display your saved picture. Reload the page to retry.',
    );
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
      showError('Choose a JPG, PNG or WebP picture.');
      return;
    }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      showError('Choose a nonempty picture no larger than 20 MiB.');
      return;
    }
    preview = URL.createObjectURL(file);
    image.src = preview;
    image.alt = 'Preview of your selected profile picture';
    image.hidden = false;
    fallback.setAttribute('hidden', '');
    validSelection = true;
    upload.disabled = busy;
    status.textContent = 'Preview only. Select Upload picture to save it.';
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
      method === 'PUT' ? 'Uploading picture...' : 'Removing picture...';
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
            : 'Unable to change your picture. Please try again.';
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
        method === 'PUT'
          ? 'Your picture has been saved.'
          : 'Your picture has been removed.';
    } catch (failure) {
      showError(
        failure instanceof Error
          ? failure.message
          : 'Unable to change your picture. Please try again.',
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

export {};
