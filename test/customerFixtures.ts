import type {
  Customer,
  CustomerSort,
  CustomerSource,
} from '../src/util/customers';

const PEOPLE = [
  ['Amelia', 'Hart', '2026-01-08'],
  ['Ben', 'Okafor', '2026-01-19'],
  ['Chloe', 'Brennan', '2026-02-02'],
  ['Daniel', 'Murphy', '2026-02-14'],
  ['Eilis', 'Doherty', '2026-02-27'],
  ['Fionn', 'Gallagher', '2026-03-05'],
  ['Grace', 'Patel', '2026-03-18'],
  ['Hassan', 'Ali', '2026-03-30'],
  ['Isla', 'McKenna', '2026-04-09'],
  ['Jack', 'Sullivan', '2026-04-21'],
  ['Katie', 'Nolan', '2026-05-03'],
  ['Liam', 'Carroll', '2026-05-16'],
  ['Maya', 'Singh', '2026-05-28'],
  ['Niall', 'Quinn', '2026-06-06'],
  ['Orla', 'Byrne', '2026-06-19'],
  ['Patrick', 'Lynch', '2026-07-01'],
  ['Quinn', 'Adeyemi', '2026-07-12'],
  ['Ruth', 'Campbell', '2026-07-25'],
  ['Sean', 'Kavanagh', '2026-08-04'],
  ['Tara', 'Fitzgerald', '2026-08-17'],
  ['Umar', 'Farooq', '2026-08-29'],
  ['Vicky', 'Reid', '2026-09-07'],
  ['William', 'Boyd', '2026-09-20'],
  ['Xena', 'Morrison', '2026-10-02'],
  ['Yusuf', 'Rahman', '2026-10-11'],
  ['Zoe', 'Hamilton', '2026-10-18'],
  ['Aoife', 'Devlin', '2026-10-21'],
] as const;

export const FIXTURE_CUSTOMERS: readonly Customer[] = PEOPLE.map(
  ([firstName, lastName, registrationDate], index) => ({
    id: `c-${index + 1}`,
    firstName,
    lastName,
    email: `${firstName}.${lastName}@example.com`.toLowerCase(),
    registrationDate,
  }),
);

const SORTERS: Record<CustomerSort, (a: Customer, b: Customer) => number> = {
  nameAsc: (a, b) =>
    a.firstName.localeCompare(b.firstName) ||
    a.lastName.localeCompare(b.lastName),
  nameDesc: (a, b) =>
    b.firstName.localeCompare(a.firstName) ||
    b.lastName.localeCompare(a.lastName),
  newest: (a, b) => b.registrationDate.localeCompare(a.registrationDate),
  oldest: (a, b) => a.registrationDate.localeCompare(b.registrationDate),
};

// Mirrors the backend: every search word must match a name; email is a separate filter.
export function createInMemoryCustomerSource(
  customers: readonly Customer[] = FIXTURE_CUSTOMERS,
): CustomerSource {
  return {
    async query({ search, email, sort, page, pageSize }) {
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      const matching = customers
        .filter((customer) => {
          const first = customer.firstName.toLowerCase();
          const last = customer.lastName.toLowerCase();
          return (
            words.every(
              (word) => first.includes(word) || last.includes(word),
            ) && customer.email.toLowerCase().includes(email.toLowerCase())
          );
        })
        .sort(SORTERS[sort]);
      const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
      const currentPage = Math.min(Math.max(page, 1), totalPages);
      const start = (currentPage - 1) * pageSize;
      return {
        customers: matching.slice(start, start + pageSize),
        totalCustomers: customers.length,
        matchingCustomers: matching.length,
        page: currentPage,
        totalPages,
      };
    },
    async findById(id) {
      return customers.find((customer) => customer.id === id);
    },
  };
}
