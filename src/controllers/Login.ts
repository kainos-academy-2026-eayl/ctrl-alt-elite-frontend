import { getRedirectPath } from '../util/loginRedirect';

const loginCurrentYear = document.querySelector('[data-current-year]');

if (loginCurrentYear) {
  loginCurrentYear.textContent = String(new Date().getFullYear());
}

interface LoginResponse {
  message?: string;
  user?: { role?: string };
}

const loginForm = document.querySelector<HTMLFormElement>('#loginForm');
const loginMessage = document.querySelector<HTMLElement>('#loginMessage');

async function logIn(form: HTMLFormElement, message: HTMLElement) {
  const submitButton = form.querySelector<HTMLButtonElement>(
    "button[type='submit']",
  );
  const formData = new FormData(form);
  if (submitButton) submitButton.disabled = true;
  message.textContent = '';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password'),
      }),
    });
    const data: LoginResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      message.textContent =
        response.status < 500 && data.message
          ? data.message
          : 'Unable to log in. Please try again.';
      return;
    }

    window.location.assign(getRedirectPath(data.user?.role));
  } catch {
    message.textContent = 'Unable to reach the server. Please try again later.';
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

if (loginForm && loginMessage) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void logIn(loginForm, loginMessage);
  });
}
