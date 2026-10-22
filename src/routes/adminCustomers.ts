import { type Request, type Response, Router } from 'express';
import type nunjucks from 'nunjucks';
import { ADMIN_NAV_ITEMS } from '../util/adminPortal';
import {
  buildCustomersUrl,
  CUSTOMER_SORT_OPTIONS,
  CUSTOMERS_PER_PAGE,
  type Customer,
  type CustomerSource,
  customerFullName,
  formatRegistrationDate,
  MAX_EMAIL_SEARCH_LENGTH,
  MAX_NAME_SEARCH_LENGTH,
  parseCustomerSort,
  parsePage,
  parseSearch,
} from '../util/customers';

const BASE_VIEW = { navItems: ADMIN_NAV_ITEMS, activeSlug: 'customers' };
const CUSTOMER_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

function toView(customer: Customer) {
  return {
    ...customer,
    name: customerFullName(customer),
    registeredDisplay: formatRegistrationDate(customer.registrationDate),
  };
}

export function createAdminCustomersRouter(
  templates: nunjucks.Environment,
  source: CustomerSource,
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const search = parseSearch(req.query.q, MAX_NAME_SEARCH_LENGTH);
    const email = parseSearch(req.query.email, MAX_EMAIL_SEARCH_LENGTH);
    const sort = parseCustomerSort(req.query.sort);
    const requestedPage = parsePage(req.query.page);

    try {
      const result = await source.query({
        search,
        email,
        sort,
        page: requestedPage,
        pageSize: CUSTOMERS_PER_PAGE,
      });
      const urlForPage = (page: number) =>
        buildCustomersUrl({ search, email, sort, page });

      res.type('html').send(
        templates.render('admin/customers.njk', {
          ...BASE_VIEW,
          title: 'Customers',
          search,
          email,
          sort,
          sortOptions: CUSTOMER_SORT_OPTIONS,
          customers: result.customers.map(toView),
          totalCustomers: result.totalCustomers,
          matchingCustomers: result.matchingCustomers,
          totalPages: result.totalPages,
          previousUrl:
            result.page > 1 ? urlForPage(result.page - 1) : undefined,
          nextUrl:
            result.page < result.totalPages
              ? urlForPage(result.page + 1)
              : undefined,
          pageLinks: Array.from(
            { length: Math.min(7, result.totalPages) },
            (_, index) => {
              const firstPage = Math.max(
                1,
                Math.min(result.page - 3, result.totalPages - 6),
              );
              const number = firstPage + index;
              return {
                number,
                current: number === result.page,
                url: urlForPage(number),
              };
            },
          ),
        }),
      );
    } catch (error) {
      console.error('Unable to load customers:', error);
      res
        .status(503)
        .type('html')
        .send(
          templates.render('admin/customers.njk', {
            ...BASE_VIEW,
            title: 'Customers',
            error: true,
            retryUrl: req.originalUrl,
          }),
        );
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const backUrl = '/admin/customers';
    const id = CUSTOMER_ID_PATTERN.test(String(req.params.id))
      ? String(req.params.id)
      : undefined;

    try {
      const customer = id === undefined ? undefined : await source.findById(id);
      if (!customer) {
        res
          .status(404)
          .type('html')
          .send(
            templates.render('admin/customer-detail.njk', {
              ...BASE_VIEW,
              title: 'Customer not found',
              backUrl,
              error: true,
              errorTitle: 'Customer not found',
              errorMessage: 'We could not find a customer with that ID.',
            }),
          );
        return;
      }
      res.type('html').send(
        templates.render('admin/customer-detail.njk', {
          ...BASE_VIEW,
          title: customerFullName(customer),
          backUrl,
          customer: toView(customer),
        }),
      );
    } catch (error) {
      console.error('Unable to load customer:', error);
      res
        .status(503)
        .type('html')
        .send(
          templates.render('admin/customer-detail.njk', {
            ...BASE_VIEW,
            title: 'Customer details',
            backUrl,
            error: true,
            errorTitle: 'Unable to load customer',
            errorMessage:
              'Something went wrong while loading this customer. Please try again.',
          }),
        );
    }
  });

  return router;
}
