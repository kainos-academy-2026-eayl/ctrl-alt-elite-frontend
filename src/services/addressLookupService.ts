/*
 * A stand-in for a real postcode address finder (such as getAddress.io), which
 * would need a paid API key. Any valid UK postcode returns the same six sample
 * addresses every time, on a street chosen from the postcode.
 */

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

// Postcode area (the leading letters) to town. Unknown areas use a sample town.
const TOWNS: Record<string, string> = {
  B: 'Birmingham',
  BS: 'Bristol',
  BT: 'Belfast',
  CF: 'Cardiff',
  E: 'London',
  EC: 'London',
  EH: 'Edinburgh',
  G: 'Glasgow',
  L: 'Liverpool',
  LS: 'Leeds',
  M: 'Manchester',
  N: 'London',
  NE: 'Newcastle upon Tyne',
  NW: 'London',
  SE: 'London',
  SW: 'London',
  W: 'London',
  WC: 'London',
};

const UK_POSTCODE = /^([A-Z]{1,2})(\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;
const HOUSE_NUMBERS = [1, 2, 3, 4, 5, 6];

/** "bt11aa" becomes "BT1 1AA"; returns null if it is not a UK postcode. */
export function normalisePostcode(postcode: string): string | null {
  const match = UK_POSTCODE.exec(postcode.trim().toUpperCase());
  return match ? `${match[1]}${match[2]} ${match[3]}` : null;
}

export class AddressLookupService {
  /** Returns no addresses for anything that is not a valid UK postcode. */
  async findAddresses(postcode: string): Promise<LookedUpAddress[]> {
    const normalised = normalisePostcode(postcode);
    if (!normalised) return [];
    const area = normalised.match(/^[A-Z]+/)?.[0] ?? '';
    const hash = [...normalised].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    );
    const street = STREETS[hash % STREETS.length] as string;
    const town = TOWNS[area] ?? 'Sampletown';
    return HOUSE_NUMBERS.map((number) => ({
      line1: `${number} ${street}`,
      town,
      postcode: normalised,
    }));
  }
}
