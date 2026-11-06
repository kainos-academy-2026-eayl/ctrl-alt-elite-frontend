/*
 * Suggests addresses for a real UK postcode. The postcode and its town are
 * checked with PostcodeService, but the house numbers and street are made up
 * from the postcode, so a postcode always gives the same addresses. They are
 * demo data, not real addresses.
 */

import { normalisePostcode } from '../util/checkoutForm';
import type { PostcodeService } from './postcodeService';

export interface LookedUpAddress {
  line1: string;
  town: string;
  postcode: string;
}

const STREETS = [
  'High Street',
  'Station Road',
  'Church Lane',
  'Park Avenue',
  'Victoria Road',
  'Mill Lane',
  'Queen Street',
  'Orchard Close',
];

// Postal towns for areas where the council name differs from the post town.
const POST_TOWNS: Record<string, string> = {
  E: 'London',
  EC: 'London',
  N: 'London',
  NW: 'London',
  SE: 'London',
  SW: 'London',
  W: 'London',
  WC: 'London',
};

const HOUSE_NUMBERS = [1, 2, 3, 4, 5, 6];

export class AddressLookupService {
  constructor(private readonly postcodeService: PostcodeService) {}

  /**
   * Returns no addresses if the postcode is badly formed or does not exist.
   * Throws PostcodeServiceError if the postcode cannot be checked right now.
   */
  async findAddresses(postcode: string): Promise<LookedUpAddress[]> {
    const normalised = normalisePostcode(postcode);
    if (!normalised) return [];
    const real = await this.postcodeService.findPostcode(normalised);
    if (!real) return [];

    const area = real.postcode.match(/^[A-Z]+/)?.[0] ?? '';
    const hash = [...real.postcode].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    );
    const street = STREETS[hash % STREETS.length] as string;
    const town = POST_TOWNS[area] ?? real.district;
    return HOUSE_NUMBERS.map((number) => ({
      line1: `${number} ${street}`,
      town,
      postcode: real.postcode,
    }));
  }
}
