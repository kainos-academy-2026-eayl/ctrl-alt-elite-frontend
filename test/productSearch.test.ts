import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { normaliseSearchTerm } from '../src/util/productSearch';

// The matching rules are tested in the backend, which owns product search.
describe('normaliseSearchTerm', () => {
  it('trims and limits the term, and ignores non-strings', () => {
    assert.equal(normaliseSearchTerm('  lamp '), 'lamp');
    assert.equal(normaliseSearchTerm('a'.repeat(500)).length, 100);
    assert.equal(normaliseSearchTerm(['a', 'b']), '');
    assert.equal(normaliseSearchTerm(undefined), '');
  });
});
