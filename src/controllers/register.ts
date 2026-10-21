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
    isValidEmail(emailInput.value) ? '' : 'Please enter a valid email address.',
  );
});

passwordInput.addEventListener('input', () => {
  passwordInput.setCustomValidity('');
});

const API_BASE_URL = '';
const submitButton = getElement<HTMLButtonElement>(
  "button[type='submit']",
  registrationForm,
);

async function registerAccount(): Promise<void> {
  submitButton.disabled = true;
  passwordMessage.textContent = 'Creating your account...';

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
      passwordMessage.textContent =
        data.message || 'Unable to create your account. Please try again.';
      return;
    }

    registrationForm.reset();
    passwordMessage.textContent = 'Account created successfully.';
  } catch {
    passwordMessage.textContent =
      'Unable to reach the server. Please try again later.';
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
    emailInput.setCustomValidity('Please enter a valid email address.');
    emailInput.reportValidity();
    return;
  }

  if (!isValidPassword(passwordInput.value)) {
    passwordInput.setCustomValidity(
      'Use at least 8 characters, including a digit and one of: @, £, $, %, &.',
    );
    passwordInput.reportValidity();
    return;
  }

  if (!passwordsMatch(passwordInput.value, confirmPasswordInput.value)) {
    confirmPasswordInput.setCustomValidity('Passwords do not match.');
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

export {};
