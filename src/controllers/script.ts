const currentYear = document.querySelector('[data-current-year]');

if (currentYear) {
  currentYear.textContent = String(new Date().getFullYear());
}

const dropdowns = Array.from(
  document.querySelectorAll<HTMLDetailsElement>('[data-nav-dropdown]'),
);

function closeDropdowns(except?: HTMLDetailsElement): HTMLDetailsElement[] {
  const closed: HTMLDetailsElement[] = [];
  for (const dropdown of dropdowns) {
    if (dropdown !== except && dropdown.hasAttribute('open')) {
      dropdown.removeAttribute('open');
      closed.push(dropdown);
    }
  }
  return closed;
}

for (const dropdown of dropdowns) {
  dropdown.addEventListener('toggle', () => {
    if (dropdown.open) closeDropdowns(dropdown);
  });
}

document.addEventListener('click', (event) => {
  for (const dropdown of dropdowns) {
    if (!(event.target instanceof Node) || !dropdown.contains(event.target)) {
      dropdown.removeAttribute('open');
    }
  }
});

// The menu button is a checkbox, so it works without this script; the script
// only adds closing with Escape.
const navToggle = document.querySelector<HTMLInputElement>('[data-nav-toggle]');

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const [closed] = closeDropdowns();
  if (closed) {
    closed.querySelector('summary')?.focus();
    return;
  }
  if (navToggle?.checked) {
    navToggle.checked = false;
    navToggle.focus();
  }
});

export {};
