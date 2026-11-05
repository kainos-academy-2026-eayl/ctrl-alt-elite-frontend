import './i18n';
import { t } from '../i18n/runtime';

const loginCurrentYear = document.querySelector('[data-current-year]');

if (loginCurrentYear) {
  loginCurrentYear.textContent = String(new Date().getFullYear());
}

const loginPassword = document.querySelector<HTMLInputElement>('#password');
const passwordToggle = document.querySelector<HTMLButtonElement>(
  '[data-password-toggle]',
);

if (loginPassword && passwordToggle) {
  passwordToggle.addEventListener('click', () => {
    const showPassword = loginPassword.type === 'password';
    loginPassword.type = showPassword ? 'text' : 'password';
    const label = t(showPassword ? 'js.password.hide' : 'js.password.show');
    passwordToggle.setAttribute('aria-label', label);
    passwordToggle.title = label;
  });
  passwordToggle.hidden = false;
}
