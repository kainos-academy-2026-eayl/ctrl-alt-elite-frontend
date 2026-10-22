const loginCurrentYear = document.querySelector('[data-current-year]');

if (loginCurrentYear) {
  loginCurrentYear.textContent = String(new Date().getFullYear());
}

const loginForm = document.querySelector<HTMLFormElement>('.login-form');
const loginMessage = document.querySelector<HTMLElement>('#loginMessage');

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!loginMessage) return;
  const submitButton = loginForm.querySelector<HTMLButtonElement>(
    "button[type='submit']",
  );
  const form = new FormData(loginForm);

  loginMessage.textContent = '';
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
      }),
    });

    if (response.ok) {
      window.location.assign('/');
      return;
    }

    const data: { message?: string } = await response.json().catch(() => ({}));
    loginMessage.textContent =
      response.status === 401
        ? 'Incorrect email or password.'
        : data.message || 'Unable to log in. Please try again.';
  } catch {
    loginMessage.textContent =
      'Unable to reach the server. Please try again later.';
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

export {};
