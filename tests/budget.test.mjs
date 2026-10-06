import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CATEGORIES,
  parseAmountInput,
  getCategoryStatus,
  summarizeBudget,
  createInitialState,
  migrateFromLegacyCookies,
  buildBudgetCsv,
} from '../js/budget.js';

test('parseAmountInput obsługuje przecinek, kropkę i odrzuca błędne kwoty', () => {
  assert.equal(parseAmountInput('42,50'), 42.5);
  assert.equal(parseAmountInput(' 100.256 '), 100.26);
  assert.equal(parseAmountInput('0'), null);
  assert.equal(parseAmountInput('-15'), null);
  assert.equal(parseAmountInput('abc'), null);
  assert.equal(parseAmountInput('2000000'), null);
});

test('getCategoryStatus wylicza stany ok, warning (<25%) i danger (<=0)', () => {
  const ok = getCategoryStatus(1000, 200);
  assert.equal(ok.remaining, 800);
  assert.equal(ok.percentLeft, 80);
  assert.equal(ok.level, 'ok');

  const warn = getCategoryStatus(1000, 800);
  assert.equal(warn.remaining, 200);
  assert.equal(warn.percentLeft, 20);
  assert.equal(warn.level, 'warning');

  const danger = getCategoryStatus(1000, 1200);
  assert.equal(danger.remaining, -200);
  assert.equal(danger.percentLeft, 0);
  assert.equal(danger.level, 'danger');
});

test('summarizeBudget zlicza sumę limitów, wydatków i pozostałego budżetu', () => {
  const state = createInitialState();
  const summary = summarizeBudget(state.categories, [
    { id: 't1', categoryId: 'jedzenie', amount: 250, createdAt: '2026-11-25T10:00:00Z' },
    { id: 't2', categoryId: 'jedzenie', amount: 50, createdAt: '2026-11-25T11:00:00Z' },
    { id: 't3', categoryId: 'dojazdy', amount: 100, createdAt: '2026-11-25T12:00:00Z' },
  ]);

  assert.equal(summary.totalLimit, 3350);
  assert.equal(summary.totalSpent, 400);
  assert.equal(summary.totalRemaining, 2950);
  assert.equal(summary.percentUsed, 12);
  assert.equal(summary.spentByCategory.jedzenie, 300);
  assert.equal(summary.spentByCategory.dojazdy, 100);
});

test('migrateFromLegacyCookies bezpiecznie przenosi stare ciasteczka', () => {
  const cats = encodeURIComponent(JSON.stringify([{ id: 'c1', name: 'Kawa', icon: '☕', limit: 200 }]));
  const spent = encodeURIComponent(JSON.stringify({ c1: 75.5 }));
  const migrated = migrateFromLegacyCookies(`foo=bar; app_categories=${cats}; app_spent_data=${spent}`);

  assert.ok(migrated);
  assert.equal(migrated.categories.length, 1);
  assert.equal(migrated.categories[0].name, 'Kawa');
  assert.equal(migrated.transactions.length, 1);
  assert.equal(migrated.transactions[0].amount, 75.5);
  assert.equal(migrateFromLegacyCookies('other=1'), null);
});

test('buildBudgetCsv generuje polski CSV i neutralizuje formuły', () => {
  const csv = buildBudgetCsv(DEFAULT_CATEGORIES, [
    {
      id: 't1',
      categoryId: 'jedzenie',
      amount: 39.9,
      note: '=SUM(A1:A2)',
      createdAt: '2026-11-25T14:00:00Z',
    },
  ]);

  assert.ok(csv.startsWith('\uFEFFData;Kategoria;Kwota (PLN);Notatka'));
  assert.ok(csv.includes('2026-11-25;Jedzenie;39,90;\'=SUM(A1:A2)'));
});
