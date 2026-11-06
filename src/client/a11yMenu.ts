/*
 * The floating accessibility button (views/_pageTop.njk). Without this script
 * it still opens and its form still works; this adds:
 * - Escape, or clicking elsewhere, closes the panel (focus returns to the button)
 * - dragging the button to another corner, which is saved for later visits
 * It also lets Escape close the Filter & sort dropdown and its sections.
 */

const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const DRAG_THRESHOLD_PX = 6;

function setPosition(widget: HTMLElement, position: string): void {
  for (const option of POSITIONS) {
    widget.classList.toggle(`a11y-widget--${option}`, option === position);
  }
  const select = widget.querySelector<HTMLSelectElement>(
    '[data-a11y-position]',
  );
  if (select) select.value = position;
  // Saved like the panel's own form, so the next page starts in this corner.
  void fetch('/preferences', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ position }),
  }).catch(() => {
    // The button still moves for this page if saving fails.
  });
}

function nearestCorner(x: number, y: number): string {
  const vertical = y < window.innerHeight / 2 ? 'top' : 'bottom';
  const horizontal = x < window.innerWidth / 2 ? 'left' : 'right';
  return `${vertical}-${horizontal}`;
}

function setUp(widget: HTMLDetailsElement): void {
  const toggle = widget.querySelector<HTMLElement>('summary');
  if (!toggle) return;
  widget.querySelector('[data-a11y-drag-hint]')?.removeAttribute('hidden');

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && widget.open) {
      widget.open = false;
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (widget.open && !widget.contains(event.target as Node)) {
      widget.open = false;
    }
  });

  let start: { x: number; y: number } | null = null;
  let dragged = false;

  toggle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    dragged = false;
    toggle.setPointerCapture(event.pointerId);
  });

  toggle.addEventListener('pointermove', (event) => {
    if (!start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (!dragged && moved < DRAG_THRESHOLD_PX) return;
    if (!dragged) {
      dragged = true;
      widget.open = false;
      widget.classList.add('is-dragging');
    }
    const half = toggle.offsetWidth / 2;
    widget.style.left = `${event.clientX - half}px`;
    widget.style.top = `${event.clientY - half}px`;
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
  });

  const finish = (event: PointerEvent) => {
    if (!start) return;
    start = null;
    if (!dragged) return;
    widget.classList.remove('is-dragging');
    widget.removeAttribute('style');
    setPosition(widget, nearestCorner(event.clientX, event.clientY));
  };
  toggle.addEventListener('pointerup', finish);
  toggle.addEventListener('pointercancel', finish);

  // A drag should not also open or close the panel.
  toggle.addEventListener('click', (event) => {
    if (dragged) {
      event.preventDefault();
      dragged = false;
    }
  });
}

for (const widget of document.querySelectorAll<HTMLDetailsElement>(
  '[data-a11y-widget]',
)) {
  setUp(widget);
}

// Escape closes the innermost open filter section, then the filter panel,
// and puts keyboard focus back on the part that opened it.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const focused = document.activeElement;
  const open = focused?.closest<HTMLDetailsElement>(
    'details.filters-group[open], details.filters-panel[open]',
  );
  if (!open) return;
  open.open = false;
  open.querySelector<HTMLElement>('summary')?.focus();
});
