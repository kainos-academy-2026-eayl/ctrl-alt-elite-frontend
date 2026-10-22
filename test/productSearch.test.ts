import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { SAMPLE_PRODUCTS } from '../src/data/sampleProducts';
import { normaliseSearchTerm, searchProducts } from '../src/util/productSearch';

function namesFor(term: string): string[] {
  return searchProducts(SAMPLE_PRODUCTS, term).map((p) => p.name);
}

describe('searchProducts', () => {
  it('matches a product by name', () => {
    assert.deepEqual(namesFor('Desk Lamp'), ['Desk Lamp']);
  });

  it('matches a product by keyword', () => {
    assert.deepEqual(namesFor('coffee'), ['Ceramic Mug']);
  });

  it('is case-insensitive', () => {
    assert.deepEqual(namesFor('CERAMIC'), ['Ceramic Mug']);
  });

  it('matches partial terms and includes out of stock products', () => {
    assert.deepEqual(namesFor('headphone'), [
      'Noise-Cancelling Headphones',
      'Studio Headphones',
    ]);
  });

  it('requires every word to match', () => {
    assert.deepEqual(namesFor('studio headphone'), ['Studio Headphones']);
  });

  it('returns nothing for a blank or unmatched term', () => {
    assert.deepEqual(namesFor('   '), []);
    assert.deepEqual(namesFor('zzzz'), []);
  });
});

describe('normaliseSearchTerm', () => {
  it('trims and limits the term, and ignores non-strings', () => {
    assert.equal(normaliseSearchTerm('  lamp '), 'lamp');
    assert.equal(normaliseSearchTerm('a'.repeat(500)).length, 100);
    assert.equal(normaliseSearchTerm(['a', 'b']), '');
    assert.equal(normaliseSearchTerm(undefined), '');
  });
});
