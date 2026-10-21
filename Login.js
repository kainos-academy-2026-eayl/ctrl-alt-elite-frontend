const loginCurrentYear = document.querySelector('[data-current-year]')

if (loginCurrentYear) {
  loginCurrentYear.textContent = new Date().getFullYear()
}
