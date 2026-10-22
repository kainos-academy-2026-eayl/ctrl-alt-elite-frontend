import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  buildNotifications,
  buildSummaryCards,
  buildSystemStatus,
  loadDashboardCustomerData,
} from '../src/util/adminDashboard';
import type { CustomerSource } from '../src/util/customers';
import { createInMemoryCustomerSource } from './customerFixtures';

const NOW = new Date('2026-10-22T10:00:00Z');

describe('dashboard customer data', () => {
  it('counts customers registered in the last 7 days', async () => {
    const data = await loadDashboardCustomerData(
      createInMemoryCustomerSource(),
      NOW,
    );
    // Fixtures registered on or after 2026-10-16: Zoe (10-18) and Aoife (10-21).
    assert.equal(data.available, true);
    assert.equal(data.totalCustomers, 27);
    assert.equal(data.newCustomers, 2);
    assert.equal(data.recentCustomers.length, 5);
    assert.equal(data.recentCustomers[0]?.firstName, 'Aoife');
    assert.deepEqual(buildNotifications(data), [
      '2 new customers registered in the last 7 days',
    ]);
  });

  it('uses singular wording for one new customer and no notification for none', async () => {
    const one = await loadDashboardCustomerData(
      createInMemoryCustomerSource(),
      new Date('2026-10-26T10:00:00Z'),
    );
    assert.deepEqual(buildNotifications(one), [
      '1 new customer registered in the last 7 days',
    ]);
    const none = await loadDashboardCustomerData(
      createInMemoryCustomerSource(),
      new Date('2027-01-01T00:00:00Z'),
    );
    assert.deepEqual(buildNotifications(none), []);
  });

  it('returns unavailable placeholder data instead of throwing', async () => {
    const failing: CustomerSource = {
      query: async () => {
        throw new Error('down');
      },
      findById: async () => undefined,
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      const data = await loadDashboardCustomerData(failing, NOW);
      assert.equal(data.available, false);
      assert.equal(data.totalCustomers, 0);
      assert.deepEqual(buildNotifications(data), []);
    } finally {
      console.error = originalError;
    }
  });

  it('only replaces the Customers card, and only when data is available', async () => {
    const cards = [
      { label: 'Orders', value: 0 },
      { label: 'Customers', value: 0 },
    ];
    const data = await loadDashboardCustomerData(
      createInMemoryCustomerSource(),
      NOW,
    );
    assert.deepEqual(buildSummaryCards(cards, data), [
      { label: 'Orders', value: 0 },
      { label: 'Customers', value: 27 },
    ]);
    assert.deepEqual(
      buildSummaryCards(cards, { ...data, available: false }),
      cards,
    );
  });

  it('derives backend status from availability and leaves email unknown', () => {
    const up = buildSystemStatus(true);
    assert.deepEqual(
      up.map((service) => service.ok),
      [true, true, true, false],
    );
    assert.equal(up[3]?.text, 'Status unavailable');
    assert.ok(buildSystemStatus(false).every((service) => !service.ok));
  });
});
