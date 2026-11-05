import { createOrdersApi } from '../util/adminOrdersApi';
import { readReportRange, validateReportRange } from '../util/adminReports';
import {
  renderReportAccessDenied,
  renderReportError,
  renderSalesReport,
} from '../util/adminReportViews';
import {
  AccessDeniedError,
  loginRedirectFor,
  SessionExpiredError,
} from '../util/apiErrors';

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

const results = getElement<HTMLElement>('[data-report-results]');
const form = getElement<HTMLFormElement>('[data-report-form]');
const fromInput = getElement<HTMLInputElement>('#report-from');
const toInput = getElement<HTMLInputElement>('#report-to');
const formError = getElement<HTMLElement>('[data-report-error]');

const range = readReportRange(new URLSearchParams(window.location.search));
fromInput.value = range.from;
toInput.value = range.to;

form.addEventListener('submit', (event) => {
  const problem = validateReportRange({
    from: fromInput.value,
    to: toInput.value,
  });
  if (problem) {
    event.preventDefault();
    formError.textContent = problem;
    formError.hidden = false;
  }
});

async function loadReport(): Promise<void> {
  try {
    results.innerHTML = renderSalesReport(
      await createOrdersApi().getSalesReport(range),
    );
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      window.location.assign(loginRedirectFor(window.location));
      return;
    }
    if (error instanceof AccessDeniedError) {
      results.innerHTML = renderReportAccessDenied();
      return;
    }
    console.error('Unable to load the sales report:', error);
    results.innerHTML = renderReportError(
      window.location.pathname + window.location.search,
    );
  }
}

void loadReport();
