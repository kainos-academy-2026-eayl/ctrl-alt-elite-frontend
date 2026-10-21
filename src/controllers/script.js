const currentYear = document.querySelector('[data-current-year]');

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

const accountMenu = document.querySelector('[data-account-menu]');

if (accountMenu) {
  document.addEventListener('click', (event) => {
    if (!accountMenu.contains(event.target)) {
      accountMenu.removeAttribute('open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && accountMenu.hasAttribute('open')) {
      accountMenu.removeAttribute('open');
      accountMenu.querySelector('summary').focus();
    }
  });
}
