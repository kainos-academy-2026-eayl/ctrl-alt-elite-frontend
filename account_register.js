const registrationForm = document.querySelector("#registrationForm");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirmPassword");
const passwordMessage = document.querySelector("#passwordMessage");

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function areAllInputsValid() {
    return registrationForm.checkValidity()
        && isValidEmail(emailInput.value)
        && isValidPassword(passwordInput.value)
        && passwordsMatch(passwordInput.value, confirmPasswordInput.value);
}

function passwordsMatch(password, confirmation) {
    return password === confirmation;
}

function isValidPassword(password) {
    const specialCharacters = ["@", "£", "$", "%", "&"];
    const hasSpecialCharacter = specialCharacters.some((character) => password.includes(character));
    const hasDigit = /\d/.test(password);

    return password.length >= 8 && hasSpecialCharacter && hasDigit;
}

emailInput.addEventListener("input", () => {
    if (!emailInput.value) {
        emailInput.setCustomValidity("");
        return;
    }

    emailInput.setCustomValidity(
        isValidEmail(emailInput.value) ? "" : "Please enter a valid email address."
    );
});

passwordInput.addEventListener("input", () => {
    passwordInput.setCustomValidity("");
});

registrationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    emailInput.setCustomValidity("");
    confirmPasswordInput.setCustomValidity("");
    passwordMessage.textContent = "";
    const inputsAreValid = areAllInputsValid();

    if (!isValidEmail(emailInput.value)) {
        emailInput.setCustomValidity("Please enter a valid email address.");
        emailInput.reportValidity();
        return;
    }

    if (!isValidPassword(passwordInput.value)) {
        passwordInput.setCustomValidity(
            "Use at least 8 characters, including a digit and one of: @, £, $, %, &."
        );
        passwordInput.reportValidity();
        return;
    }

    if (!passwordsMatch(passwordInput.value, confirmPasswordInput.value)) {
        confirmPasswordInput.setCustomValidity("Passwords do not match.");
        confirmPasswordInput.reportValidity();
        return;
    }

    if (!inputsAreValid) {
        registrationForm.reportValidity();
        return;
    }

    passwordMessage.textContent = "All fields are valid.";
});

confirmPasswordInput.addEventListener("input", () => {
    confirmPasswordInput.setCustomValidity("");
    passwordMessage.textContent = "";
});

