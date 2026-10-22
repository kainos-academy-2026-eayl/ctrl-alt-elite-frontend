const loginCurrentYear = document.querySelector('[data-current-year]');

if (loginCurrentYear) {
  loginCurrentYear.textContent = String(new Date().getFullYear());
}

export {};
