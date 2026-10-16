import {
  STORAGE_KEY,
  buildBudgetCsv,
  createInitialState,
  formatPLN,
  getCategoryStatus,
  migrateFromLegacyCookies,
  parseAmountInput,
  summarizeBudget,
} from './budget.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EMOJI_OPTIONS = ['🍔', '🚌', '🎓', '🏠', '🎬', '💊', '🛍️', '☕', '✈️', '📦'];
const MAX_VISIBLE_TRANSACTIONS = 10;

let state = loadState();
let activeCategoryId = null;
let selectedEmoji = EMOJI_OPTIONS[0];
let showAllTransactions = false;
let undoPayload = null;
let undoTimerId = null;

const els = {
  monthLabel: document.getElementById('month-label'),
  exportCsvBtn: document.getElementById('export-csv-btn'),
  openSettingsBtn: document.getElementById('open-settings-btn'),
  summaryBalance: document.getElementById('summary-balance'),
  summaryPill: document.getElementById('summary-pill'),
  summarySpent: document.getElementById('summary-spent'),
  summaryLimit: document.getElementById('summary-limit'),
  summaryBar: document.getElementById('summary-bar'),
  categoriesList: document.getElementById('categories-list'),
  categoriesCount: document.getElementById('categories-count'),
  transactionsContainer: document.getElementById('transactions-container'),
  transactionsMeta: document.getElementById('transactions-meta'),
  addModal: document.getElementById('add-modal'),
  addModalTitle: document.getElementById('add-modal-title'),
  addForm: document.getElementById('add-form'),
  expenseAmount: document.getElementById('expense-amount'),
  expenseNote: document.getElementById('expense-note'),
  addError: document.getElementById('add-error'),
  settingsModal: document.getElementById('settings-modal'),
  newCatForm: document.getElementById('new-cat-form'),
  newCatName: document.getElementById('new-cat-name'),
  newCatLimit: document.getElementById('new-cat-limit'),
  emojiPicker: document.getElementById('emoji-picker'),
  settingsError: document.getElementById('settings-error'),
  settingsCatList: document.getElementById('settings-cat-list'),
  openResetConfirmBtn: document.getElementById('open-reset-confirm-btn'),
  resetConfirmBox: document.getElementById('reset-confirm-box'),
  confirmResetBtn: document.getElementById('confirm-reset-btn'),
  cancelResetBtn: document.getElementById('cancel-reset-btn'),
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message'),
  toastUndoBtn: document.getElementById('toast-undo-btn'),
};

function createSvgIcon(paths, viewBox = '0 0 24 24') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function isValidState(parsed) {
  return (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray(parsed.categories) &&
    parsed.categories.length > 0 &&
    Array.isArray(parsed.transactions)
  );
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidState(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fallback below if storage is unavailable or corrupted
  }

  const migrated = migrateFromLegacyCookies(document.cookie);
  if (migrated && migrated.categories.length > 0) {
    saveState(migrated);
    clearLegacyCookies();
    return migrated;
  }

  const initial = createInitialState();
  saveState(initial);
  return initial;
}

function clearLegacyCookies() {
  document.cookie = 'app_categories=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  document.cookie = 'app_spent_data=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
}

function saveState(nextState = state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function showError(target, message) {
  target.textContent = message;
  target.hidden = false;
}

function clearError(target) {
  target.textContent = '';
  target.hidden = true;
}

function showToast(message, onUndo = null) {
  if (undoTimerId) {
    clearTimeout(undoTimerId);
    undoTimerId = null;
  }

  undoPayload = typeof onUndo === 'function' ? onUndo : null;
  els.toastMessage.textContent = message;
  els.toastUndoBtn.hidden = !undoPayload;
  els.toast.hidden = false;

  undoTimerId = setTimeout(() => {
    els.toast.hidden = true;
    undoPayload = null;
    undoTimerId = null;
  }, 6000);
}

function formatTransactionDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderSummary(summary) {
  els.summaryBalance.textContent = formatPLN(summary.totalRemaining);
  els.summaryBalance.classList.toggle('is-negative', summary.totalRemaining < 0);

  let level = 'ok';
  if (summary.totalRemaining <= 0) {
    level = 'danger';
  } else if (summary.totalLimit > 0 && summary.totalRemaining < summary.totalLimit * 0.25) {
    level = 'warning';
  }

  els.summaryPill.className = `status-pill is-${level}`;
  els.summaryPill.textContent =
    summary.totalRemaining < 0
      ? 'Przekroczono budżet'
      : `Wykorzystano ${summary.percentUsed}%`;

  els.summarySpent.textContent = `Wydano ${formatPLN(summary.totalSpent)}`;
  els.summaryLimit.textContent = `Budżet ${formatPLN(summary.totalLimit)}`;

  els.summaryBar.className = `progress-fill is-${level}`;
  els.summaryBar.style.width = `${summary.percentUsed}%`;
}

function createStatCell(labelText, valueText, extraClass = '', alignEnd = false) {
  const cell = document.createElement('div');
  cell.className = alignEnd ? 'stat-cell stat-cell--end' : 'stat-cell';

  const label = document.createElement('span');
  label.className = 'stat-label';
  label.textContent = labelText;

  const value = document.createElement('span');
  value.className = `stat-value tabular${extraClass ? ` ${extraClass}` : ''}`;
  value.textContent = valueText;

  cell.append(label, value);
  return cell;
}

function renderCategories(summary) {
  els.categoriesList.replaceChildren();
  els.categoriesCount.textContent = `${state.categories.length} kat.`;

  for (const cat of state.categories) {
    const spent = summary.spentByCategory[cat.id] || 0;
    const status = getCategoryStatus(cat.limit, spent);
    const usedPercent =
      cat.limit > 0 ? Math.min(100, Math.round((status.spent / cat.limit) * 100)) : 100;

    const card = document.createElement('article');
    card.className = 'category-card';

    const header = document.createElement('div');
    header.className = 'category-header';

    const identity = document.createElement('div');
    identity.className = 'category-identity';

    const badge = document.createElement('span');
    badge.className = 'category-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = cat.icon;

    const name = document.createElement('h3');
    name.className = 'category-name';
    name.textContent = cat.name;

    identity.append(badge, name);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-expense-btn';
    addBtn.setAttribute('aria-label', `Dodaj wydatek w kategorii ${cat.name}`);
    addBtn.appendChild(createSvgIcon(['M12 5v14', 'M5 12h14']));
    addBtn.addEventListener('click', () => openAddModal(cat.id));

    header.append(identity, addBtn);

    const stats = document.createElement('div');
    stats.className = 'category-stats';
    stats.append(
      createStatCell('Wydano', formatPLN(status.spent)),
      createStatCell('Limit', formatPLN(cat.limit)),
      createStatCell('Zostało', formatPLN(status.remaining), `is-${status.level}`, true)
    );

    const track = document.createElement('div');
    track.className = 'progress-track';
    const fill = document.createElement('div');
    fill.className = `progress-fill is-${status.level}`;
    fill.style.width = `${usedPercent}%`;
    track.appendChild(fill);

    card.append(header, stats, track);
    els.categoriesList.appendChild(card);
  }
}

function deleteTransaction(txId) {
  const index = state.transactions.findIndex((tx) => tx.id === txId);
  if (index === -1) return;

  const [removed] = state.transactions.splice(index, 1);
  saveState();
  renderAll();

  showToast(`Usunięto wydatek ${formatPLN(removed.amount)}`, () => {
    state.transactions.splice(Math.min(index, state.transactions.length), 0, removed);
    saveState();
    renderAll();
  });
}

function renderTransactions() {
  els.transactionsContainer.replaceChildren();
  const sorted = [...state.transactions].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );

  els.transactionsMeta.textContent = `${sorted.length} wpisów`;

  if (sorted.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Brak wydatków w tym miesiącu. Kliknij + przy kategorii, aby dodać pierwszy.';
    els.transactionsContainer.appendChild(empty);
    return;
  }

  const catMap = new Map(state.categories.map((c) => [c.id, c]));
  const visible = showAllTransactions ? sorted : sorted.slice(0, MAX_VISIBLE_TRANSACTIONS);

  const list = document.createElement('ul');
  list.className = 'tx-list';

  for (const tx of visible) {
    const cat = catMap.get(tx.categoryId);
    const li = document.createElement('li');
    li.className = 'tx-item';

    const main = document.createElement('div');
    main.className = 'tx-main';

    const icon = document.createElement('span');
    icon.className = 'tx-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = cat ? cat.icon : '💳';

    const details = document.createElement('div');
    details.className = 'tx-details';

    const title = document.createElement('span');
    title.className = 'tx-title';
    title.textContent = tx.note ? tx.note : cat ? cat.name : 'Usunięta kategoria';

    const sub = document.createElement('span');
    sub.className = 'tx-sub';
    const catLabel = cat ? cat.name : 'Usunięta kategoria';
    sub.textContent = `${catLabel} • ${formatTransactionDate(tx.createdAt)}`;

    details.append(title, sub);
    main.append(icon, details);

    const right = document.createElement('div');
    right.className = 'tx-right';

    const amount = document.createElement('span');
    amount.className = 'tx-amount tabular';
    amount.textContent = `-${formatPLN(tx.amount)}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'ghost-icon-btn';
    deleteBtn.setAttribute('aria-label', `Usuń wydatek ${formatPLN(tx.amount)}`);
    deleteBtn.appendChild(
      createSvgIcon([
        'M3 6h18',
        'M8 6V4h8v2',
        'M19 6l-1 14H6L5 6',
        'M10 11v6',
        'M14 11v6',
      ])
    );
    deleteBtn.addEventListener('click', () => deleteTransaction(tx.id));

    right.append(amount, deleteBtn);
    li.append(main, right);
    list.appendChild(li);
  }

  els.transactionsContainer.appendChild(list);

  if (sorted.length > MAX_VISIBLE_TRANSACTIONS) {
    const toggleWrap = document.createElement('div');
    toggleWrap.style.padding = '10px 14px';
    toggleWrap.style.borderTop = '1px solid var(--border)';
    toggleWrap.style.textAlign = 'center';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn btn-secondary btn-sm';
    toggleBtn.style.width = '100%';
    toggleBtn.textContent = showAllTransactions
      ? 'Pokaż mniej'
      : `Pokaż wszystkie (${sorted.length})`;
    toggleBtn.addEventListener('click', () => {
      showAllTransactions = !showAllTransactions;
      renderTransactions();
    });

    toggleWrap.appendChild(toggleBtn);
    els.transactionsContainer.appendChild(toggleWrap);
  }
}

function renderSettingsCategories() {
  els.settingsCatList.replaceChildren();

  for (const cat of state.categories) {
    const row = document.createElement('div');
    row.className = 'settings-cat-row';

    const info = document.createElement('div');
    info.className = 'settings-cat-info';

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = cat.icon;

    const name = document.createElement('span');
    name.className = 'settings-cat-name';
    name.textContent = cat.name;

    info.append(icon, name);

    const controls = document.createElement('div');
    controls.className = 'settings-cat-controls';

    const limitInput = document.createElement('input');
    limitInput.type = 'text';
    limitInput.inputMode = 'decimal';
    limitInput.className = 'limit-input';
    limitInput.value = String(cat.limit);
    limitInput.setAttribute('aria-label', `Limit miesięczny dla ${cat.name}`);
    limitInput.addEventListener('change', () => {
      const parsed = parseAmountInput(limitInput.value);
      if (parsed === null) {
        limitInput.value = String(cat.limit);
        showError(els.settingsError, 'Limit musi być dodatnią liczbą (maks. 1 000 000 zł).');
        return;
      }
      clearError(els.settingsError);
      cat.limit = parsed;
      limitInput.value = String(parsed);
      saveState();
      renderAll();
      showToast(`Zaktualizowano limit dla „${cat.name}”`);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'ghost-icon-btn';
    deleteBtn.setAttribute('aria-label', `Usuń kategorię ${cat.name}`);
    deleteBtn.appendChild(
      createSvgIcon([
        'M3 6h18',
        'M8 6V4h8v2',
        'M19 6l-1 14H6L5 6',
      ])
    );
    deleteBtn.addEventListener('click', () => deleteCategory(cat.id));

    controls.append(limitInput, deleteBtn);
    row.append(info, controls);
    els.settingsCatList.appendChild(row);
  }
}

function renderEmojiPicker() {
  els.emojiPicker.replaceChildren();
  for (const emoji of EMOJI_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = emoji === selectedEmoji ? 'emoji-choice is-selected' : 'emoji-choice';
    btn.textContent = emoji;
    btn.setAttribute('aria-label', `Ikona ${emoji}`);
    btn.addEventListener('click', () => {
      selectedEmoji = emoji;
      renderEmojiPicker();
    });
    els.emojiPicker.appendChild(btn);
  }
}

function renderAll() {
  const summary = summarizeBudget(state.categories, state.transactions);
  renderSummary(summary);
  renderCategories(summary);
  renderTransactions();
  if (!els.settingsModal.hidden) {
    renderSettingsCategories();
  }
}

function openAddModal(categoryId) {
  const cat = state.categories.find((c) => c.id === categoryId);
  if (!cat) return;

  activeCategoryId = categoryId;
  els.addModalTitle.textContent = `${cat.icon} Dodaj wydatek — ${cat.name}`;
  els.expenseAmount.value = '';
  els.expenseNote.value = '';
  clearError(els.addError);
  els.addModal.hidden = false;
  requestAnimationFrame(() => els.expenseAmount.focus());
}

function closeAddModal() {
  els.addModal.hidden = true;
  activeCategoryId = null;
}

function openSettingsModal() {
  clearError(els.settingsError);
  els.resetConfirmBox.hidden = true;
  renderEmojiPicker();
  renderSettingsCategories();
  els.settingsModal.hidden = false;
}

function closeSettingsModal() {
  els.settingsModal.hidden = true;
  els.resetConfirmBox.hidden = true;
}

function deleteCategory(catId) {
  if (state.categories.length <= 1) {
    showError(els.settingsError, 'Musisz zachować co najmniej jedną kategorię budżetu.');
    return;
  }

  const index = state.categories.findIndex((c) => c.id === catId);
  if (index === -1) return;

  clearError(els.settingsError);
  const prevTransactions = [...state.transactions];
  const [removed] = state.categories.splice(index, 1);
  state.transactions = state.transactions.filter((tx) => tx.categoryId !== catId);
  saveState();
  renderAll();

  showToast(`Usunięto kategorię „${removed.name}”`, () => {
    state.categories.splice(Math.min(index, state.categories.length), 0, removed);
    state.transactions = prevTransactions;
    saveState();
    renderAll();
  });
}

function handleExportCsv() {
  if (state.transactions.length === 0) {
    showToast('Brak wydatków do wyeksportowania.');
    return;
  }

  const csv = buildBudgetCsv(state.categories, state.transactions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const monthTag = new Date().toISOString().slice(0, 7);
  link.href = url;
  link.download = `wydatki-${monthTag}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Pobrano plik CSV z wydatkami.');
}

function bindEvents() {
  els.exportCsvBtn.addEventListener('click', handleExportCsv);
  els.openSettingsBtn.addEventListener('click', openSettingsModal);

  for (const btn of document.querySelectorAll('[data-close-modal]')) {
    btn.addEventListener('click', () => {
      closeAddModal();
      closeSettingsModal();
    });
  }

  els.addModal.addEventListener('click', (e) => {
    if (e.target === els.addModal) closeAddModal();
  });

  els.settingsModal.addEventListener('click', (e) => {
    if (e.target === els.settingsModal) closeSettingsModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAddModal();
      closeSettingsModal();
    }
  });

  els.addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmountInput(els.expenseAmount.value);
    if (amount === null) {
      showError(els.addError, 'Podaj poprawną kwotę większą od 0 zł (np. 42,50).');
      els.expenseAmount.focus();
      return;
    }

    const note = els.expenseNote.value.trim().slice(0, 60);
    state.transactions.push({
      id: createId('tx'),
      categoryId: activeCategoryId,
      amount,
      note,
      createdAt: new Date().toISOString(),
    });
    saveState();
    closeAddModal();
    renderAll();
  });

  els.newCatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.newCatName.value.trim().slice(0, 30);
    const limit = parseAmountInput(els.newCatLimit.value);

    if (!name) {
      showError(els.settingsError, 'Wpisz nazwę nowej kategorii.');
      els.newCatName.focus();
      return;
    }
    if (limit === null) {
      showError(els.settingsError, 'Podaj dodatni limit miesięczny (np. 400).');
      els.newCatLimit.focus();
      return;
    }

    clearError(els.settingsError);
    state.categories.push({
      id: createId('cat'),
      name,
      icon: selectedEmoji,
      limit,
    });
    els.newCatName.value = '';
    els.newCatLimit.value = '';
    saveState();
    renderAll();
    showToast(`Dodano kategorię „${name}”`);
  });

  els.openResetConfirmBtn.addEventListener('click', () => {
    els.resetConfirmBox.hidden = false;
  });

  els.cancelResetBtn.addEventListener('click', () => {
    els.resetConfirmBox.hidden = true;
  });

  els.confirmResetBtn.addEventListener('click', () => {
    const prevTransactions = [...state.transactions];
    state.transactions = [];
    saveState();
    closeSettingsModal();
    renderAll();

    showToast('Wyzerowano wydatki miesiąca.', () => {
      state.transactions = prevTransactions;
      saveState();
      renderAll();
    });
  });

  els.toastUndoBtn.addEventListener('click', () => {
    const cb = undoPayload;
    undoPayload = null;
    if (undoTimerId) {
      clearTimeout(undoTimerId);
      undoTimerId = null;
    }
    els.toast.hidden = true;
    if (cb) cb();
  });
}

function initMonthLabel() {
  const monthText = new Date().toLocaleDateString('pl-PL', {
    month: 'long',
    year: 'numeric',
  });
  els.monthLabel.textContent = monthText;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

initMonthLabel();
bindEvents();
renderAll();
registerServiceWorker();
