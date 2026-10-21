const currentYear = document.querySelector('[data-current-year]');

if (currentYear) {
  currentYear.textContent = String(new Date().getFullYear());
}

const accountMenu = document.querySelector<HTMLDetailsElement>(
  '[data-account-menu]',
);

if (accountMenu) {
  document.addEventListener('click', (event) => {
    if (
      !(event.target instanceof Node) ||
      !accountMenu.contains(event.target)
    ) {
      accountMenu.removeAttribute('open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && accountMenu.hasAttribute('open')) {
      accountMenu.removeAttribute('open');
      accountMenu.querySelector('summary')?.focus();
    }
  });
}

export {};
