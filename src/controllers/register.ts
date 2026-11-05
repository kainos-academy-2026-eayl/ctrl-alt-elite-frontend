import './i18n';
import { t } from '../i18n/runtime';

function getElement<T extends Element>(
  selector: string,
  parent: ParentNode = document,
): T {
  const element = parent.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

interface ApiError {
  message?: string;
}

const registrationForm = getElement<HTMLFormElement>('#registrationForm');
const emailInput = getElement<HTMLInputElement>('#email');
const passwordInput = getElement<HTMLInputElement>('#password');
const confirmPasswordInput = getElement<HTMLInputElement>('#confirmPassword');
const passwordMessage = getElement<HTMLElement>('#passwordMessage');

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function areAllInputsValid(): boolean {
  return (
    registrationForm.checkValidity() &&
    isValidEmail(emailInput.value) &&
    isValidPassword(passwordInput.value) &&
    passwordsMatch(passwordInput.value, confirmPasswordInput.value)
  );
}

function passwordsMatch(password: string, confirmation: string): boolean {
  return password === confirmation;
}

function isValidPassword(password: string): boolean {
  const specialCharacters = ['@', '£', '$', '%', '&'];
  const hasSpecialCharacter = specialCharacters.some((character) =>
    password.includes(character),
  );
  const hasDigit = /\d/.test(password);

  return password.length >= 8 && hasSpecialCharacter && hasDigit;
}

emailInput.addEventListener('input', () => {
  if (!emailInput.value) {
    emailInput.setCustomValidity('');
    return;
  }

  emailInput.setCustomValidity(
    isValidEmail(emailInput.value) ? '' : t('js.register.invalidEmail'),
  );
});

passwordInput.addEventListener('input', () => {
  passwordInput.setCustomValidity('');
  confirmPasswordInput.setCustomValidity('');
});

const API_BASE_URL = '';
const submitButton = getElement<HTMLButtonElement>(
  "button[type='submit']",
  registrationForm,
);

async function registerAccount(): Promise<void> {
  submitButton.disabled = true;
  passwordMessage.textContent = t('js.register.creating');

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: getElement<HTMLInputElement>('#firstName').value,
        lastName: getElement<HTMLInputElement>('#lastName').value,
        email: emailInput.value,
        password: passwordInput.value,
        confirmPassword: confirmPasswordInput.value,
      }),
    });
    const data: ApiError = await response.json().catch(() => ({}));

    if (!response.ok) {
      passwordMessage.textContent = data.message || t('js.register.failed');
      return;
    }

    registrationForm.reset();
    passwordMessage.textContent = t('js.register.created');
  } catch {
    passwordMessage.textContent = t('js.register.unreachable');
  } finally {
    submitButton.disabled = false;
  }
}

registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  emailInput.setCustomValidity('');
  confirmPasswordInput.setCustomValidity('');
  passwordMessage.textContent = '';
  const inputsAreValid = areAllInputsValid();

  if (!isValidEmail(emailInput.value)) {
    emailInput.setCustomValidity(t('js.register.invalidEmail'));
    emailInput.reportValidity();
    return;
  }

  if (!isValidPassword(passwordInput.value)) {
    passwordInput.setCustomValidity(t('js.register.weakPassword'));
    passwordInput.reportValidity();
    return;
  }

  if (!passwordsMatch(passwordInput.value, confirmPasswordInput.value)) {
    confirmPasswordInput.setCustomValidity(t('js.register.mismatch'));
    confirmPasswordInput.reportValidity();
    return;
  }

  if (!inputsAreValid) {
    registrationForm.reportValidity();
    return;
  }

  await registerAccount();
});

confirmPasswordInput.addEventListener('input', () => {
  confirmPasswordInput.setCustomValidity('');
  passwordMessage.textContent = '';
});
