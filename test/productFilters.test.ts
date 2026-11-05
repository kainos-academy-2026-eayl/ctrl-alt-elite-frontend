import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  vi,
} from 'vitest';
import { createApp } from '../src/app';
import {
  buildFilterPanel,
  isProductFacetsDto,
  type ProductFacetsDto,
  readFilterQuery,
  toBackendParams,
} from '../src/util/productFilters';

const FACETS: ProductFacetsDto = {
  total: 7,
  categories: [
    { name: 'Hoodie', count: 1 },
    { name: 'Shirt', count: 4 },
    { name: 'T-Shirt', count: 2 },
  ],
  stock: { in: 6, out: 1 },
  priceRange: { min: '9.99', max: '26.99' },
};

describe('readFilterQuery', () => {
  it('reads repeated categories, stock, a price band and the sort', () => {
    assert.deepEqual(
      readFilterQuery({
        stock: ['out', 'in', 'maybe'],
        category: [' Shirt ', 'T-Shirt', 'Shirt', ''],
        price: '10-25',
        sort: 'newest',
      }),
      {
        stock: ['in', 'out'],
        categories: ['Shirt', 'T-Shirt'],
        minPrice: '',
        maxPrice: '',
        priceBand: '10-25',
        sort: 'newest',
      },
    );
  });

  it('ignores bad values', () => {
    assert.deepEqual(
      readFilterQuery({
        minPrice: '-1',
        maxPrice: 'lots',
        price: '1-2',
        sort: 'random',
      }),
      readFilterQuery({}),
    );
    assert.equal(readFilterQuery({ minPrice: '£12.5' }).minPrice, '12.5');
  });
});

describe('toBackendParams', () => {
  it('turns a price band into a min and max, and leaves out the default sort', () => {
    assert.equal(
      toBackendParams(
        readFilterQuery({ price: 'under-10', category: ['A', 'B'] }),
      ).toString(),
      'category=A&category=B&maxPrice=9.99',
    );
    assert.equal(
      toBackendParams(readFilterQuery({ price: '50-plus' })).toString(),
      'minPrice=50',
    );
  });

  it('lets a custom range replace the price band', () => {
    assert.equal(
      toBackendParams(
        readFilterQuery({
          price: '10-25',
          minPrice: '30',
          sort: 'price-asc',
        }),
      ).toString(),
      'minPrice=30&sort=price-asc',
    );
  });
});

describe('buildFilterPanel', () => {
  const query = readFilterQuery({
    stock: 'in',
    category: ['Shirt', 'Jumpers'],
    price: '10-25',
    sort: 'price-desc',
  });
  const panel = buildFilterPanel({
    action: '/search',
    searchTerm: 'shirt & tie',
    query,
    facets: FACETS,
  });

  it('marks the chosen options and shows their counts', () => {
    assert.deepEqual(
      panel.stockOptions.map(({ value, count, isChecked }) => [
        value,
        count,
        isChecked,
      ]),
      [
        ['in', 6, true],
        ['out', 1, false],
      ],
    );
    // A chosen category with no matches is still listed so it can be unticked.
    assert.deepEqual(
      panel.categoryOptions.map(({ value, count, isChecked }) => [
        value,
        count,
        isChecked,
      ]),
      [
        ['Hoodie', 1, false],
        ['Jumpers', 0, true],
        ['Shirt', 4, true],
        ['T-Shirt', 2, false],
      ],
    );
    assert.equal(
      panel.priceBands.find((band) => band.isChecked)?.value,
      '10-25',
    );
    assert.equal(panel.isAnyPriceChecked, false);
    assert.equal(
      panel.sortOptions.find((option) => option.isSelected)?.value,
      'price-desc',
    );
    assert.equal(panel.sortLabel, 'Price: high to low');
  });

  it('summarises each section for when it is closed', () => {
    assert.equal(panel.stockSummary, 'In stock');
    assert.equal(panel.categorySummary, '2 selected');
    assert.equal(panel.priceSummary, '£10 to £25');
    const empty = buildFilterPanel({
      action: '/products',
      searchTerm: null,
      query: readFilterQuery({ stock: ['in', 'out'], category: 'Shirt' }),
      facets: FACETS,
    });
    assert.equal(empty.stockSummary, 'Any');
    assert.equal(empty.categorySummary, 'Shirt');
    assert.equal(empty.priceSummary, 'Any price');
  });

  it('lists each active filter with a link that removes only that one', () => {
    assert.equal(panel.activeCount, 4);
    assert.deepEqual(panel.chips, [
      {
        label: 'In stock',
        removeUrl:
          '/search?q=shirt+%26+tie&category=Shirt&category=Jumpers&price=10-25&sort=price-desc',
      },
      {
        label: 'Shirt',
        removeUrl:
          '/search?q=shirt+%26+tie&stock=in&category=Jumpers&price=10-25&sort=price-desc',
      },
      {
        label: 'Jumpers',
        removeUrl:
          '/search?q=shirt+%26+tie&stock=in&category=Shirt&price=10-25&sort=price-desc',
      },
      {
        label: '£10 to £25',
        removeUrl:
          '/search?q=shirt+%26+tie&stock=in&category=Shirt&category=Jumpers&sort=price-desc',
      },
    ]);
  });

  it('clears every filter and goes back to Recommended, keeping the search term', () => {
    assert.equal(panel.clearUrl, '/search?q=shirt+%26+tie');
  });

  it('describes custom price ranges', () => {
    const label = (minPrice: string, maxPrice: string) =>
      buildFilterPanel({
        action: '/products',
        searchTerm: null,
        query: readFilterQuery({ minPrice, maxPrice }),
        facets: FACETS,
      }).chips[0]?.label;
    assert.equal(label('10', '24.5'), '£10 to £24.50');
    assert.equal(label('5', ''), 'From £5');
    assert.equal(label('', '1000'), 'Up to £1,000');
  });
});

describe('isProductFacetsDto', () => {
  it('accepts the backend shape and rejects anything else', () => {
    assert.equal(isProductFacetsDto(FACETS), true);
    assert.equal(isProductFacetsDto({ ...FACETS, priceRange: null }), true);
    assert.equal(isProductFacetsDto({ ...FACETS, total: '7' }), false);
    assert.equal(isProductFacetsDto({ ...FACETS, stock: null }), false);
    assert.equal(isProductFacetsDto(null), false);
  });
});

const BACKEND_ORIGIN = 'https://backend.example.test';

function searchItem(id: string, name: string, price: string) {
  return {
    id,
    name,
    description: `${name} description`,
    imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
    price,
    keywords: ['Shirt'],
    isInStock: true,
  };
}

function catalogueItem(id: string, name: string) {
  return {
    id,
    name,
    category: 'Shirt',
    price: 12.5,
    image: 'data:image/png;base64,iVBORw0KGgo=',
    description: `${name} description`,
    stock: 4,
  };
}

describe('Filter and sort on the search and catalogue pages (no JavaScript)', () => {
  const fetchFrontend = globalThis.fetch;
  let frontend: Server;
  let base: string;
  let backendUrls: URL[];
  let backendProducts: unknown[];
  let backendFacets: ProductFacetsDto | undefined;

  beforeAll(async () => {
    frontend = createServer(createApp(BACKEND_ORIGIN));
    await new Promise<void>((resolve) =>
      frontend.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${(frontend.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => frontend.close(resolve));
  });

  beforeEach(() => {
    backendUrls = [];
    backendProducts = [searchItem('pou', 'POU Shirt', '12.50')];
    backendFacets = FACETS;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(new Request(input, init).url);
      assert.equal(url.origin, BACKEND_ORIGIN);
      backendUrls.push(url);
      return Response.json({
        searchTerm: url.searchParams.get('q') ?? '',
        products: backendProducts,
        isClosestMatch: false,
        ...(backendFacets ? { facets: backendFacets } : {}),
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function page(path: string) {
    const res = await fetchFrontend(`${base}${path}`);
    assert.equal(res.status, 200);
    return res.text();
  }

  it('sends the filters to the backend and shows the panel, tags and count', async () => {
    const html = await page(
      '/search?q=shirt&stock=in&category=Shirt&price=10-25&sort=price-desc',
    );
    // The site navigation also asks the backend for the category list.
    const sent = backendUrls.find(
      (url) => url.pathname === '/api/products/search',
    );
    assert.equal(
      sent?.search,
      '?stock=in&category=Shirt&minPrice=10&maxPrice=24.99&sort=price-desc&q=shirt',
    );
    assert.match(html, /<summary class="filters-toggle">/);
    // Each filter is its own collapsible section showing the current choice.
    assert.equal(
      (html.match(/<details class="filters-group">/g) ?? []).length,
      3,
    );
    assert.match(
      html,
      /filters-group-title">Category<\/span>\s*<span class="filters-group-value">Shirt<\/span>/,
    );
    assert.match(
      html,
      /<form class="filters-form" action="\/search" method="get">/,
    );
    assert.match(html, /<input type="hidden" name="q" value="shirt" \/>/);
    assert.match(
      html,
      /<option value="price-desc" selected>Price: high to low<\/option>/,
    );
    assert.match(html, /value="Shirt" checked \/>/);
    assert.match(html, /Shirt <span class="filters-count">\(4\)<\/span>/);
    assert.match(
      html,
      /id="filters-price-10-25" type="radio" name="price" value="10-25" checked/,
    );
    assert.match(
      html,
      /class="filters-chip" href="\/search\?q=shirt&amp;category=Shirt&amp;price=10-25&amp;sort=price-desc">In stock/,
    );
    assert.match(html, /Showing 1 of 7 products found for &quot;shirt&quot;\./);
    assert.doesNotMatch(html, /<script/);
  });

  it('explains when the filters leave nothing to show', async () => {
    backendProducts = [];
    const html = await page('/search?q=shirt&stock=out');
    assert.match(
      html,
      /No products match your filters for &quot;shirt&quot;\. Remove a filter or choose Clear all\./,
    );
    assert.match(html, /href="\/search\?q=shirt">Clear all<\/a>/);
  });

  it('leaves the panel out when nothing matched or the backend sent no facets', async () => {
    backendFacets = { ...FACETS, total: 0, categories: [] };
    backendProducts = [];
    assert.doesNotMatch(await page('/search?q=zzz'), /filters-toggle/);

    backendFacets = undefined;
    backendProducts = [searchItem('pou', 'POU Shirt', '12.50')];
    const html = await page('/search?q=shirt');
    assert.doesNotMatch(html, /filters-toggle/);
    assert.match(html, /1 product found for &quot;shirt&quot;\./);
  });

  it('filters the product catalogue the same way', async () => {
    backendProducts = [
      catalogueItem('pou', 'POU Shirt'),
      catalogueItem('polo', 'Striped Polo Shirt'),
    ];
    const html = await page(
      '/products?category=Shirt&minPrice=10&sort=name-desc',
    );
    // The site navigation also asks the backend for the category list.
    const sent = backendUrls.find(
      (url) => url.pathname === '/api/products' && url.search !== '',
    );
    assert.equal(sent?.pathname, '/api/products');
    assert.equal(sent?.search, '?category=Shirt&minPrice=10&sort=name-desc');
    assert.match(
      html,
      /<form class="filters-form" action="\/products" method="get">/,
    );
    // The header's search box has name="q"; the filter panel must not.
    assert.doesNotMatch(
      /<form class="filters-form"[\s\S]*?<\/form>/.exec(html)?.[0] ?? '',
      /name="q"/,
    );
    assert.match(
      html,
      /class="filters-chip" href="\/products\?category=Shirt&amp;sort=name-desc">From £10/,
    );
    assert.match(html, /Showing 2 of 7 products/);
    assert.match(html, /href="\/assets\/filters\.css"/);
  });
});
