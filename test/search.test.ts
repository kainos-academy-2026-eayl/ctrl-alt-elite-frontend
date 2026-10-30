import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { ProductSearchResponseDto } from '../src/dtos/productSearchDto';
import {
  MAX_SEARCH_TERM_LENGTH,
  normaliseSearchTerm,
} from '../src/server/controllers/searchController';
import { ProductService } from '../src/services/productService';
import { buildSearchPage } from '../src/views/search.page';

const NOW = new Date('2026-10-30T12:00:00Z');

function item(name: string, price = '8.99', isInStock = true) {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description: `${name} description`,
    imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
    price,
    keywords: [],
    isInStock,
  };
}

function result(
  products: ReturnType<typeof item>[],
  isClosestMatch = false,
): ProductSearchResponseDto {
  return { searchTerm: 'x', products, isClosestMatch };
}

function page(
  searchTerm: string,
  searchResult: ProductSearchResponseDto | null,
) {
  return buildSearchPage({
    searchTerm,
    result: searchResult,
    errorMessage: '',
    basket: null,
    now: NOW,
  });
}

describe('normaliseSearchTerm', () => {
  it('trims and limits the term, and ignores non-strings', () => {
    assert.equal(normaliseSearchTerm('  hoodie '), 'hoodie');
    assert.equal(
      normaliseSearchTerm('a'.repeat(500)).length,
      MAX_SEARCH_TERM_LENGTH,
    );
    assert.equal(normaliseSearchTerm(['a', 'b']), '');
    assert.equal(normaliseSearchTerm(undefined), '');
  });
});

describe('buildSearchPage', () => {
  it('asks for a search term when the box is empty', () => {
    assert.equal(
      page('', null).statusMessage,
      'Enter a product name or keyword to search.',
    );
  });

  it('counts exact matches with the right plural', () => {
    assert.equal(
      page('hoodie', result([item('Kainos Hoodie')])).statusMessage,
      '1 product found for "hoodie".',
    );
    assert.equal(
      page('shirt', result([item('A Shirt'), item('B Shirt')])).statusMessage,
      '2 products found for "shirt".',
    );
  });

  it('explains closest matches with the right plural', () => {
    assert.equal(
      page('hodie', result([item('Kainos Hoodie')], true)).statusMessage,
      'No exact matches for "hodie". Showing the closest match.',
    );
    assert.equal(
      page('shrt', result([item('A Shirt'), item('B Shirt')], true))
        .statusMessage,
      'No exact matches for "shrt". Showing the closest matches.',
    );
  });

  it('says when nothing matches', () => {
    assert.equal(
      page('zzz', result([])).statusMessage,
      'No products found for "zzz". Try a different name or keyword.',
    );
  });

  it('formats prices in pounds and keeps stock status', () => {
    const [product] = page(
      'x',
      result([item('Crown', '9999.00', false)]),
    ).products;
    assert.equal(product?.price, '£9,999.00');
    assert.equal(product?.isInStock, false);
  });

  it('shows only the error message when the search failed', () => {
    const failed = buildSearchPage({
      searchTerm: 'hoodie',
      result: null,
      errorMessage: 'Search is unavailable.',
      basket: null,
      now: NOW,
    });
    assert.equal(failed.statusMessage, '');
    assert.equal(failed.errorMessage, 'Search is unavailable.');
    assert.deepEqual(failed.products, []);
  });

  it('includes the header basket count and the current year', () => {
    const built = page('', null);
    assert.deepEqual(built.basketSummary, {
      itemCount: 0,
      itemCountText: '0 items',
    });
    assert.equal(built.currentYear, 2026);
    assert.equal(built.addToBasketUrl, '/basket/items');
  });
});

describe('ProductService.search', () => {
  function fakeFetch(response: Response | Error) {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input));
      if (response instanceof Error) throw response;
      return response;
    };
    return { fetchImpl, urls };
  }

  it('sends the term as an encoded query parameter', async () => {
    const body = { searchTerm: 'a&b', products: [], isClosestMatch: false };
    const { fetchImpl, urls } = fakeFetch(Response.json(body));
    const found = await new ProductService(
      'http://backend.test',
      fetchImpl,
    ).search('a&b');
    assert.deepEqual(found, body);
    assert.deepEqual(urls, ['http://backend.test/api/products/search?q=a%26b']);
  });

  it('throws when the backend fails', async () => {
    const { fetchImpl } = fakeFetch(new Response('nope', { status: 500 }));
    await assert.rejects(
      new ProductService('http://backend.test', fetchImpl).search('x'),
      /status 500/,
    );
  });

  it('throws when the backend sends an unexpected body', async () => {
    const { fetchImpl } = fakeFetch(Response.json({ products: 'nope' }));
    await assert.rejects(
      new ProductService('http://backend.test', fetchImpl).search('x'),
      /unexpected response/,
    );
  });
});
