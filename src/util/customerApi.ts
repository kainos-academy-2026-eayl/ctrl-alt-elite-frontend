import type {
  Customer,
  CustomerPage,
  CustomerQuery,
  CustomerSource,
} from './customers';

type Fetch = typeof fetch;

interface ListResponse {
  customers: Customer[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function isCustomer(value: unknown): value is Customer {
  if (typeof value !== 'object' || value === null) return false;
  const customer = value as Record<string, unknown>;
  return (
    typeof customer.id === 'string' &&
    typeof customer.firstName === 'string' &&
    typeof customer.lastName === 'string' &&
    typeof customer.email === 'string' &&
    typeof customer.registrationDate === 'string'
  );
}

function isListResponse(value: unknown): value is ListResponse {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.customers) &&
    body.customers.every(isCustomer) &&
    typeof body.page === 'number' &&
    typeof body.total === 'number' &&
    typeof body.totalPages === 'number'
  );
}

export function createApiCustomerSource(
  backendOrigin: string,
  fetchImpl: Fetch = fetch,
): CustomerSource {
  const origin = new URL(backendOrigin).origin;

  async function request(path: string, params?: URLSearchParams) {
    const query = params?.toString();
    return fetchImpl(`${origin}${path}${query ? `?${query}` : ''}`, {
      headers: { accept: 'application/json' },
    });
  }

  async function list(params: URLSearchParams): Promise<ListResponse> {
    const response = await request('/api/customers', params);
    if (!response.ok) {
      throw new Error(
        `Customers request failed with status ${response.status}`,
      );
    }
    const body: unknown = await response.json();
    if (!isListResponse(body)) {
      throw new Error('Customers response was not in the expected format.');
    }
    return body;
  }

  function toParams(query: CustomerQuery, page: number): URLSearchParams {
    const params = new URLSearchParams({
      sort: query.sort,
      page: String(page),
      pageSize: String(query.pageSize),
    });
    if (query.search) params.set('search', query.search);
    if (query.email) params.set('email', query.email);
    return params;
  }

  return {
    async query(query): Promise<CustomerPage> {
      let result = await list(toParams(query, query.page));

      // A page past the end returns nothing, so fall back to the last real page.
      if (
        result.customers.length === 0 &&
        result.total > 0 &&
        query.page > result.totalPages
      ) {
        result = await list(toParams(query, result.totalPages));
      }

      const isFiltered = Boolean(query.search || query.email);
      const totalCustomers = isFiltered
        ? (
            await list(
              new URLSearchParams({
                page: '1',
                pageSize: '1',
                sort: query.sort,
              }),
            )
          ).total
        : result.total;

      return {
        customers: result.customers,
        totalCustomers,
        matchingCustomers: result.total,
        page: result.page,
        totalPages: Math.max(1, result.totalPages),
      };
    },

    async findById(id) {
      const response = await request(
        `/api/customers/${encodeURIComponent(id)}`,
      );
      if (response.status === 404) return undefined;
      if (!response.ok) {
        throw new Error(
          `Customer request failed with status ${response.status}`,
        );
      }
      const body = (await response.json()) as { customer?: unknown };
      if (!isCustomer(body.customer)) {
        throw new Error('Customer response was not in the expected format.');
      }
      return body.customer;
    },
  };
}
