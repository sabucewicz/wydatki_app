export const STORAGE_KEY = 'wydatki_state_v2';

export const DEFAULT_CATEGORIES = [
  { id: 'jedzenie', name: 'Jedzenie', icon: '🍔', limit: 1000 },
  { id: 'dojazdy', name: 'Dojazdy', icon: '🚌', limit: 250 },
  { id: 'studia', name: 'Studia', icon: '🎓', limit: 800 },
  { id: 'mieszkanie', name: 'Mieszkanie', icon: '🏠', limit: 800 },
  { id: 'inne', name: 'Inne', icon: '📦', limit: 500 },
];

export function roundPLN(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function parseAmountInput(raw) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) {
    return null;
  }
  return roundPLN(parsed);
}

export function formatPLN(amount) {
  const safe = Number.isFinite(amount) ? amount : 0;
  return (
    safe.toLocaleString('pl-PL', {
      minimumFractionDigits: Number.isInteger(roundPLN(safe)) ? 0 : 2,
      maximumFractionDigits: 2,
    }) + ' zł'
  );
}

export function getCategoryStatus(limit, spent) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  const safeSpent = Math.max(0, Number(spent) || 0);
  const remaining = roundPLN(safeLimit - safeSpent);
  const percentLeft =
    safeLimit > 0 ? Math.max(0, Math.min(100, Math.round((remaining / safeLimit) * 100))) : 0;

  let level = 'ok';
  if (remaining <= 0) {
    level = 'danger';
  } else if (safeLimit > 0 && remaining < safeLimit * 0.25) {
    level = 'warning';
  }

  return {
    spent: roundPLN(safeSpent),
    remaining,
    percentLeft,
    level,
  };
}

export function summarizeBudget(categories, transactions) {
  const spentByCategory = {};
  for (const tx of transactions) {
    if (!tx || !tx.categoryId) continue;
    const amt = Number(tx.amount) || 0;
    if (amt <= 0) continue;
    spentByCategory[tx.categoryId] = roundPLN((spentByCategory[tx.categoryId] || 0) + amt);
  }

  let totalLimit = 0;
  let totalSpent = 0;
  for (const cat of categories) {
    totalLimit = roundPLN(totalLimit + Math.max(0, Number(cat.limit) || 0));
    totalSpent = roundPLN(totalSpent + (spentByCategory[cat.id] || 0));
  }

  const totalRemaining = roundPLN(totalLimit - totalSpent);
  const percentUsed =
    totalLimit > 0 ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;

  return {
    totalLimit,
    totalSpent,
    totalRemaining,
    percentUsed,
    spentByCategory,
  };
}

export function createInitialState() {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    transactions: [],
  };
}

// Jednorazowa migracja danych ze starszej wersji zapisującej stan w ciasteczkach
export function migrateFromLegacyCookies(cookieString) {
  if (!cookieString) return null;

  const readCookie = (name) => {
    const match = cookieString.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    if (!match) return null;
    try {
      return JSON.parse(decodeURIComponent(match[1]));
    } catch {
      return null;
    }
  };

  const oldCats = readCookie('app_categories');
  const oldSpent = readCookie('app_spent_data');
  if (!Array.isArray(oldCats) && (!oldSpent || typeof oldSpent !== 'object')) {
    return null;
  }

  const categories = Array.isArray(oldCats)
    ? oldCats
        .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
        .map((c) => ({
          id: c.id,
          name: c.name.trim().slice(0, 30) || 'Kategoria',
          icon: typeof c.icon === 'string' && c.icon.trim() ? c.icon.trim().slice(0, 4) : '💳',
          limit: Math.max(1, roundPLN(c.limit)),
        }))
    : DEFAULT_CATEGORIES.map((c) => ({ ...c }));

  const transactions = [];
  if (oldSpent && typeof oldSpent === 'object') {
    const nowIso = new Date().toISOString();
    for (const cat of categories) {
      const val = roundPLN(oldSpent[cat.id]);
      if (val > 0) {
        transactions.push({
          id: `migrated_${cat.id}`,
          categoryId: cat.id,
          amount: val,
          note: 'Przeniesione z poprzedniej wersji',
          createdAt: nowIso,
        });
      }
    }
  }

  return { categories, transactions };
}

function escapeCsvCell(value) {
  const str = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[;"\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildBudgetCsv(categories, transactions) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const header = ['Data', 'Kategoria', 'Kwota (PLN)', 'Notatka'];
  const sorted = [...transactions].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );

  const rows = sorted.map((tx) => {
    const cat = catMap.get(tx.categoryId);
    const datePart = String(tx.createdAt || '').slice(0, 10) || '—';
    const amount = roundPLN(tx.amount).toFixed(2).replace('.', ',');
    return [
      escapeCsvCell(datePart),
      escapeCsvCell(cat ? cat.name : 'Usunięta kategoria'),
      escapeCsvCell(amount),
      escapeCsvCell(tx.note || ''),
    ].join(';');
  });

  return '\uFEFF' + [header.join(';'), ...rows].join('\r\n');
}
