const STORAGE_KEY = 'orbita-expenses-by-month-v1';
const BUDGETS_KEY = 'orbita-expense-budgets-v1';
const THEME_KEY = 'orbita-expenses-theme-v1';
const DEFAULT_THEME = 'light';
const CHART_COLORS = ['#ff6b00', '#0a2540', '#1e88e5', '#64748b', '#12a6b3', '#7995da', '#f39b55', '#49627f', '#db7d45', '#8a98a8'];
const CATEGORIES = [
  { id: 'groceries', name: 'Продукты', icon: '🛒', color: '#25a879' },
  { id: 'home', name: 'ЖКХ и Дом', icon: '🏠', color: '#4778c7' },
  { id: 'transport', name: 'Транспорт', icon: '🚗', color: '#6b73d6' },
  { id: 'health', name: 'Здоровье', icon: '💊', color: '#2d9caa' },
  { id: 'mobile', name: 'Связь', icon: '📱', color: '#7b62c8' },
  { id: 'dining', name: 'Еда вне дома', icon: '🍕', color: '#e9853d' },
  { id: 'shopping', name: 'Покупки', icon: '👕', color: '#cc6688' },
  { id: 'leisure', name: 'Отдых', icon: '🎬', color: '#438b78' },
  { id: 'gifts', name: 'Подарки', icon: '🎁', color: '#d79a32' },
  { id: 'other', name: 'Прочее', icon: '❓', color: '#718096' },
];

const elements = {
  themeToggle: document.querySelector('#theme-toggle'),
  homeView: document.querySelector('#home-view'),
  analyticsView: document.querySelector('#analytics-view'),
  viewTabs: [...document.querySelectorAll('.view-tab[data-view]')],
  monthPicker: document.querySelector('#month-picker'),
  monthTotal: document.querySelector('#month-total'),
  expenseCount: document.querySelector('#expense-count'),
  dailyAverage: document.querySelector('#daily-average'),
  monthChange: document.querySelector('#month-change'),
  categoryList: document.querySelector('#category-list'),
  transactionList: document.querySelector('#transaction-list'),
  transactionsMeta: document.querySelector('#transactions-meta'),
  emptyState: document.querySelector('#empty-state'),
  dialog: document.querySelector('#expense-dialog'),
  expenseForm: document.querySelector('#expense-form'),
  expenseDate: document.querySelector('#expense-date'),
  expenseAmount: document.querySelector('#expense-amount'),
  amountStep: document.querySelector('#amount-step'),
  categoryStep: document.querySelector('#category-step'),
  categoryChoices: document.querySelector('#category-choices'),
  dialogStepLabel: document.querySelector('#dialog-step-label'),
  dialogTitle: document.querySelector('#dialog-title'),
  dialogError: document.querySelector('#dialog-error'),
  storageStatus: document.querySelector('#storage-status'),
  importFile: document.querySelector('#import-file'),
  analyticsMonthTitle: document.querySelector('#analytics-month-title'),
  analyticsDaily: document.querySelector('#analytics-daily'),
  analyticsChange: document.querySelector('#analytics-change'),
  chartCanvas: document.querySelector('#expense-chart'),
  chartWrap: document.querySelector('#chart-wrap'),
  chartEmpty: document.querySelector('#chart-empty'),
  chartLegend: document.querySelector('#chart-legend'),
};

const currencyFormat = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const amountFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const transactionDateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });

let expensesByMonth = {};
let budgetsByMonth = {};
let selectedMonth = getCurrentMonth();
let expenseChart = null;

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getCurrentMonth() {
  return getTodayKey().slice(0, 7);
}

function isValidMonth(month) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function formatCurrency(amount) {
  return currencyFormat.format(amount);
}

function formatMonth(month) {
  const [year, index] = month.split('-').map(Number);
  const title = monthFormat.format(new Date(year, index - 1, 1)).replace(/\s*г\.?$/, '');
  return `${title.charAt(0).toLocaleUpperCase('ru-RU')}${title.slice(1)}`;
}

function getSafeStorageValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSafeStorageValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeSafeStorageValue(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function normalizeExpenses(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const knownCategories = new Set(CATEGORIES.map((category) => category.id));
  const normalized = {};

  for (const [month, entries] of Object.entries(source)) {
    if (!isValidMonth(month) || !Array.isArray(entries)) continue;
    const validEntries = entries.filter((entry) => (
      entry
      && typeof entry.id === 'string'
      && isValidDate(entry.date)
      && entry.date.startsWith(`${month}-`)
      && Number.isFinite(entry.amount)
      && entry.amount > 0
      && knownCategories.has(entry.category)
    )).map((entry) => ({
      id: entry.id,
      date: entry.date,
      amount: Math.round(entry.amount * 100) / 100,
      category: entry.category,
    }));
    if (validEntries.length) normalized[month] = validEntries;
  }

  return normalized;
}

function loadExpenses() {
  const saved = getSafeStorageValue(STORAGE_KEY);
  if (!saved) return {};
  try {
    return normalizeExpenses(JSON.parse(saved));
  } catch {
    return {};
  }
}

function normalizeBudgets(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const categoryIds = new Set(CATEGORIES.map((category) => category.id));
  const normalized = {};
  for (const [month, categoryBudgets] of Object.entries(source)) {
    if (!isValidMonth(month) || !categoryBudgets || typeof categoryBudgets !== 'object' || Array.isArray(categoryBudgets)) continue;
    const validBudgets = Object.fromEntries(Object.entries(categoryBudgets).filter(([categoryId, amount]) => (
      categoryIds.has(categoryId) && Number.isFinite(amount) && amount > 0
    )));
    if (Object.keys(validBudgets).length) normalized[month] = validBudgets;
  }
  return normalized;
}

function loadBudgets() {
  const saved = getSafeStorageValue(BUDGETS_KEY);
  if (!saved) return {};
  try {
    return normalizeBudgets(JSON.parse(saved));
  } catch {
    return {};
  }
}

function persistBudgets() {
  const saved = setSafeStorageValue(BUDGETS_KEY, JSON.stringify(budgetsByMonth));
  if (!saved) elements.storageStatus.textContent = 'Лимит не сохранен: хранилище недоступно';
  return saved;
}

function persistExpenses() {
  const saved = setSafeStorageValue(STORAGE_KEY, JSON.stringify(expensesByMonth));
  elements.storageStatus.textContent = saved
    ? 'Сохранено на этом устройстве'
    : 'Хранилище недоступно: изменения останутся только до закрытия вкладки';
  return saved;
}

function getSelectedExpenses() {
  return expensesByMonth[selectedMonth] ?? [];
}

function getMonthTotal(month) {
  return (expensesByMonth[month] ?? []).reduce((total, expense) => total + expense.amount, 0);
}

function getPreviousMonth(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const previous = new Date(year, monthIndex - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function getElapsedDays(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  if (month === getCurrentMonth()) return new Date().getDate();
  return month < getCurrentMonth() ? daysInMonth : 0;
}

function getMonthChange(monthTotal) {
  const previousTotal = getMonthTotal(getPreviousMonth(selectedMonth));
  if (previousTotal === 0) return { text: monthTotal > 0 ? 'Новый месяц' : 'Нет данных', direction: 'neutral' };
  const percent = Math.round(((monthTotal - previousTotal) / previousTotal) * 100);
  return {
    text: `${percent > 0 ? '+' : ''}${percent}% к прошлому месяцу`,
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'neutral',
  };
}

function getCategory(categoryId) {
  return CATEGORIES.find((category) => category.id === categoryId) ?? CATEGORIES[CATEGORIES.length - 1];
}

function setTheme(theme, persist = true) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  const darkMode = nextTheme === 'dark';
  elements.themeToggle.textContent = darkMode ? '☀' : '☾';
  elements.themeToggle.setAttribute('aria-label', darkMode ? 'Включить светлую тему' : 'Включить темную тему');
  document.querySelector('meta[name="theme-color"]').content = darkMode ? '#12161a' : '#f4f6f9';
  if (persist && !setSafeStorageValue(THEME_KEY, nextTheme)) {
    elements.storageStatus.textContent = 'Тема не сохранена: хранилище недоступно';
  }
}

function createCategoryCard(category, total, maxTotal, limit) {
  const card = document.createElement('article');
  card.className = 'category-card';
  card.style.setProperty('--category-color', category.color);

  const top = document.createElement('div');
  top.className = 'category-card-top';
  const icon = document.createElement('span');
  icon.className = 'category-icon';
  icon.textContent = category.icon;
  icon.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = category.name;
  top.append(icon, name);

  const amount = document.createElement('p');
  amount.className = 'category-amount';
  amount.textContent = amountFormat.format(total);
  const unit = document.createElement('small');
  unit.textContent = ' ₽';
  amount.append(unit);

  const progress = document.createElement('div');
  progress.className = 'progress-track';
  const ratio = limit > 0 ? total / limit : maxTotal > 0 ? total / maxTotal : 0;
  const percentage = Math.round(ratio * 100);
  if (limit > 0) progress.classList.add(ratio >= 1 ? 'is-over-limit' : ratio >= 0.8 ? 'is-near-limit' : 'is-limited');
  progress.setAttribute('aria-label', limit > 0
    ? `${category.name}: использовано ${percentage}% лимита ${formatCurrency(limit)}`
    : `${category.name}: ${percentage}% от максимальной категории`);
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.setProperty('--progress', `${limit > 0 ? Math.min(100, Math.max(total ? 3 : 0, ratio * 100)) : maxTotal ? Math.max(total ? 3 : 0, ratio * 100) : 0}%`);
  progress.append(fill);
  const budgetLabel = document.createElement('label');
  budgetLabel.className = 'category-budget';
  const budgetCaption = document.createElement('span');
  budgetCaption.textContent = 'Лимит / мес.';
  const budgetField = document.createElement('span');
  budgetField.className = 'budget-field';
  const budgetInput = document.createElement('input');
  budgetInput.type = 'number';
  budgetInput.min = '0';
  budgetInput.step = '100';
  budgetInput.inputMode = 'decimal';
  budgetInput.placeholder = 'Без лимита';
  budgetInput.value = limit > 0 ? String(limit) : '';
  budgetInput.setAttribute('aria-label', `Месячный лимит: ${category.name}`);
  budgetInput.addEventListener('change', () => updateCategoryBudget(category.id, budgetInput.value));
  const budgetCurrency = document.createElement('small');
  budgetCurrency.textContent = '₽';
  budgetField.append(budgetInput, budgetCurrency);
  budgetLabel.append(budgetCaption, budgetField);
  card.append(top, amount, progress, budgetLabel);
  return card;
}

function updateCategoryBudget(categoryId, rawAmount) {
  const amount = Number(rawAmount);
  budgetsByMonth[selectedMonth] ??= {};
  if (!rawAmount || !Number.isFinite(amount) || amount <= 0) {
    delete budgetsByMonth[selectedMonth][categoryId];
    if (!Object.keys(budgetsByMonth[selectedMonth]).length) delete budgetsByMonth[selectedMonth];
  } else {
    budgetsByMonth[selectedMonth][categoryId] = Math.round(amount * 100) / 100;
  }
  persistBudgets();
  render();
}

function createTransactionRow(expense) {
  const category = getCategory(expense.category);
  const row = document.createElement('article');
  row.className = 'transaction-row';
  const icon = document.createElement('span');
  icon.className = 'transaction-icon';
  icon.textContent = category.icon;
  icon.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'transaction-copy';
  const categoryName = document.createElement('div');
  categoryName.className = 'transaction-category';
  categoryName.textContent = category.name;
  const date = document.createElement('div');
  date.className = 'transaction-date';
  date.textContent = transactionDateFormat.format(new Date(`${expense.date}T12:00:00`));
  copy.append(categoryName, date);
  const amount = document.createElement('strong');
  amount.className = 'transaction-amount';
  amount.textContent = `−${formatCurrency(expense.amount)}`;
  const remove = document.createElement('button');
  remove.className = 'delete-expense';
  remove.type = 'button';
  remove.textContent = '⌫';
  remove.title = 'Удалить расход';
  remove.setAttribute('aria-label', `Удалить расход ${formatCurrency(expense.amount)}, ${category.name}`);
  remove.addEventListener('click', () => deleteExpense(expense.id));
  row.append(icon, copy, amount, remove);
  return row;
}

const chartCenterLabel = {
  id: 'monthTotalCenter',
  afterDraw(chart, args, options) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    ctx.save();
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    ctx.font = '650 17px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.text, (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2, chartArea.right - chartArea.left - 12);
    ctx.restore();
  },
};

function updateChangeLabel(element, change) {
  element.textContent = change.text;
  element.classList.remove('trend-up', 'trend-down', 'trend-neutral');
  element.classList.add(`trend-${change.direction}`);
}

function renderAnalytics(categoryTotals, monthTotal, dailyAverage, change) {
  const monthTitle = formatMonth(selectedMonth);
  elements.analyticsMonthTitle.textContent = monthTitle;
  elements.analyticsDaily.textContent = `${formatCurrency(dailyAverage)} в день`;
  updateChangeLabel(elements.analyticsChange, change);

  const categories = CATEGORIES.map((category) => ({
    ...category,
    total: categoryTotals.get(category.id) ?? 0,
  })).filter((category) => category.total > 0).sort((first, second) => second.total - first.total);
  elements.chartLegend.replaceChildren(...categories.map((category) => {
    const row = document.createElement('div');
    row.className = 'chart-legend-row';
    const marker = document.createElement('span');
    marker.className = 'chart-legend-marker';
    marker.style.backgroundColor = CHART_COLORS[CATEGORIES.findIndex((item) => item.id === category.id) % CHART_COLORS.length];
    const label = document.createElement('span');
    label.className = 'chart-legend-category';
    label.textContent = `${category.icon} ${category.name}`;
    const share = document.createElement('span');
    share.className = 'chart-legend-share';
    share.textContent = `${Math.round(category.total / monthTotal * 100)}%`;
    const amount = document.createElement('strong');
    amount.textContent = formatCurrency(category.total);
    row.append(marker, label, share, amount);
    return row;
  }));

  const chartAvailable = typeof window.Chart === 'function';
  elements.chartWrap.hidden = !monthTotal || !chartAvailable;
  elements.chartEmpty.hidden = Boolean(monthTotal && chartAvailable);
  elements.chartEmpty.querySelector('p').textContent = monthTotal && !chartAvailable
    ? 'Диаграмма недоступна без подключения к сети'
    : 'Нет расходов за этот месяц';

  if (!monthTotal || !chartAvailable) {
    expenseChart?.destroy();
    expenseChart = null;
    return;
  }

  const chartData = {
    labels: categories.map((category) => category.name),
    datasets: [{
      data: categories.map((category) => category.total),
      backgroundColor: categories.map((category) => CHART_COLORS[CATEGORIES.findIndex((item) => item.id === category.id) % CHART_COLORS.length]),
      borderColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
      borderWidth: 3,
      hoverOffset: 7,
      borderRadius: 4,
      spacing: 2,
    }],
  };

  try {
    if (!expenseChart) {
      expenseChart = new window.Chart(elements.chartCanvas, {
        type: 'doughnut',
        data: chartData,
        plugins: [chartCenterLabel],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false },
            monthTotalCenter: { text: formatCurrency(monthTotal) },
            tooltip: { callbacks: { label: (context) => ` ${context.label}: ${formatCurrency(context.raw)}` } },
          },
          animation: { duration: 360 },
        },
      });
    } else {
      expenseChart.data = chartData;
      expenseChart.options.plugins.monthTotalCenter.text = formatCurrency(monthTotal);
      expenseChart.update();
    }
  } catch {
    elements.chartWrap.hidden = true;
    elements.chartEmpty.hidden = false;
    elements.chartEmpty.querySelector('p').textContent = 'Не удалось построить диаграмму';
  }
}

function render() {
  const expenses = getSelectedExpenses().slice().sort((first, second) => (
    second.date.localeCompare(first.date) || second.id.localeCompare(first.id)
  ));
  const totalsByCategory = new Map(CATEGORIES.map((category) => [category.id, 0]));
  const monthTotal = expenses.reduce((sum, expense) => {
    totalsByCategory.set(expense.category, totalsByCategory.get(expense.category) + expense.amount);
    return sum + expense.amount;
  }, 0);
  const maxCategoryTotal = Math.max(0, ...totalsByCategory.values());
  const elapsedDays = getElapsedDays(selectedMonth);
  const dailyAverage = elapsedDays ? monthTotal / elapsedDays : 0;
  const change = getMonthChange(monthTotal);

  elements.monthPicker.value = selectedMonth;
  elements.monthTotal.replaceChildren(document.createTextNode(amountFormat.format(monthTotal)), Object.assign(document.createElement('span'), { textContent: ' ₽' }));
  elements.expenseCount.textContent = `${expenses.length} ${pluralize(expenses.length, ['операция', 'операции', 'операций'])}`;
  elements.dailyAverage.textContent = formatCurrency(dailyAverage);
  updateChangeLabel(elements.monthChange, change);
  elements.categoryList.replaceChildren(...CATEGORIES.map((category) => (
    createCategoryCard(category, totalsByCategory.get(category.id), maxCategoryTotal, budgetsByMonth[selectedMonth]?.[category.id] ?? 0)
  )));
  elements.transactionList.replaceChildren(...expenses.slice(0, 12).map(createTransactionRow));
  elements.emptyState.hidden = expenses.length > 0;
  elements.transactionsMeta.textContent = expenses.length > 12 ? `12 из ${expenses.length}` : '';
  renderAnalytics(totalsByCategory, monthTotal, dailyAverage, change);
}

function switchView(view) {
  const showAnalytics = view === 'analytics';
  elements.homeView.hidden = showAnalytics;
  elements.analyticsView.hidden = !showAnalytics;
  for (const tab of elements.viewTabs) {
    const selected = tab.dataset.view === view;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  if (showAnalytics) requestAnimationFrame(() => expenseChart?.resize());
}

function pluralize(number, forms) {
  const lastTwo = number % 100;
  const lastDigit = number % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (lastDigit === 1) return forms[0];
  if (lastDigit >= 2 && lastDigit <= 4) return forms[1];
  return forms[2];
}

function moveMonth(delta) {
  const [year, month] = selectedMonth.split('-').map(Number);
  const nextMonth = new Date(year, month - 1 + delta, 1);
  selectMonth(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`);
}

function selectMonth(month) {
  if (!isValidMonth(month)) return;
  selectedMonth = month;
  render();
}

function closeExpenseDialog() {
  elements.dialog.close();
  elements.amountStep.hidden = false;
  elements.categoryStep.hidden = true;
  elements.dialogStepLabel.textContent = 'ШАГ 1 ИЗ 2';
  elements.dialogTitle.textContent = 'Новый расход';
  elements.dialogError.textContent = '';
}

function openExpenseDialog() {
  elements.expenseForm.reset();
  elements.expenseDate.value = getTodayKey().startsWith(selectedMonth)
    ? getTodayKey()
    : `${selectedMonth}-01`;
  elements.amountStep.hidden = false;
  elements.categoryStep.hidden = true;
  elements.dialogStepLabel.textContent = 'ШАГ 1 ИЗ 2';
  elements.dialogTitle.textContent = 'Новый расход';
  elements.dialogError.textContent = '';
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.expenseAmount.focus());
}

function showCategoryStep() {
  const amount = Number(elements.expenseAmount.value);
  if (!isValidDate(elements.expenseDate.value) || !Number.isFinite(amount) || amount <= 0) {
    elements.dialogError.textContent = 'Укажите дату и сумму больше нуля.';
    elements.expenseForm.reportValidity();
    return;
  }

  elements.dialogError.textContent = '';
  elements.amountStep.hidden = true;
  elements.categoryStep.hidden = false;
  elements.dialogStepLabel.textContent = 'ШАГ 2 ИЗ 2';
  elements.dialogTitle.textContent = 'Категория расхода';
}

function addExpense(categoryId) {
  const date = elements.expenseDate.value;
  const amount = Math.round(Number(elements.expenseAmount.value) * 100) / 100;
  if (!isValidDate(date) || !Number.isFinite(amount) || amount <= 0) return;

  const month = date.slice(0, 7);
  const expense = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    amount,
    category: categoryId,
  };
  expensesByMonth[month] ??= [];
  expensesByMonth[month].push(expense);
  selectedMonth = month;
  persistExpenses();
  render();
  closeExpenseDialog();
}

function deleteExpense(id) {
  const entries = getSelectedExpenses();
  expensesByMonth[selectedMonth] = entries.filter((expense) => expense.id !== id);
  if (!expensesByMonth[selectedMonth].length) delete expensesByMonth[selectedMonth];
  persistExpenses();
  render();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  const rows = [['Дата', 'Сумма', 'Категория'], ...getSelectedExpenses()
    .slice()
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((expense) => [expense.date, amountFormat.format(expense.amount), getCategory(expense.category).name])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n');
  downloadFile(`orbita-${selectedMonth}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

function exportJson() {
  const backup = {
    format: 'orbita-expenses',
    version: 1,
    exportedAt: new Date().toISOString(),
    months: expensesByMonth,
    budgets: budgetsByMonth,
  };
  downloadFile(`orbita-backup-${getTodayKey()}.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
}

async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = normalizeExpenses(data.months ?? data.expenses ?? data);
    const incomingBudgets = normalizeBudgets(data.budgets);
    const importedCount = Object.values(incoming).reduce((sum, entries) => sum + entries.length, 0);
    const importedBudgetsCount = Object.values(incomingBudgets).reduce((sum, budgets) => sum + Object.keys(budgets).length, 0);
    if (!importedCount && !importedBudgetsCount) {
      elements.storageStatus.textContent = 'В JSON-файле не найдены записи расходов';
      return;
    }

    for (const [month, entries] of Object.entries(incoming)) {
      const merged = new Map((expensesByMonth[month] ?? []).map((expense) => [expense.id, expense]));
      for (const expense of entries) merged.set(expense.id, expense);
      expensesByMonth[month] = [...merged.values()];
    }
    for (const [month, categoryBudgets] of Object.entries(incomingBudgets)) {
      budgetsByMonth[month] = { ...budgetsByMonth[month], ...categoryBudgets };
    }
    persistExpenses();
    if (importedBudgetsCount) persistBudgets();
    elements.storageStatus.textContent = `Импортировано: ${importedCount} записей, ${importedBudgetsCount} лимитов`;
    render();
  } catch {
    elements.storageStatus.textContent = 'Не удалось прочитать JSON-файл';
  }
}

function clearMonth() {
  const hasExpenses = getSelectedExpenses().length > 0;
  const hasBudgets = Object.keys(budgetsByMonth[selectedMonth] ?? {}).length > 0;
  if (!hasExpenses && !hasBudgets) {
    elements.storageStatus.textContent = 'В этом месяце нет данных';
    return;
  }
  if (!window.confirm(`Удалить расходы и лимиты за ${formatMonth(selectedMonth)}?`)) return;
  delete expensesByMonth[selectedMonth];
  delete budgetsByMonth[selectedMonth];
  persistExpenses();
  persistBudgets();
  render();
}

function buildCategoryChoices() {
  elements.categoryChoices.replaceChildren(...CATEGORIES.map((category) => {
    const button = document.createElement('button');
    button.className = 'category-choice';
    button.type = 'button';
    button.setAttribute('aria-label', category.name);
    const icon = document.createElement('span');
    icon.className = 'category-choice-icon';
    icon.textContent = category.icon;
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = category.name;
    button.append(icon, label);
    button.addEventListener('click', () => addExpense(category.id));
    return button;
  }));
}

function init() {
  expensesByMonth = loadExpenses();
  budgetsByMonth = loadBudgets();
  selectedMonth = getCurrentMonth();
  const savedTheme = getSafeStorageValue(THEME_KEY);
  setTheme(savedTheme === 'dark' ? 'dark' : DEFAULT_THEME, false);
  buildCategoryChoices();
  render();
  window.addEventListener('load', () => {
    if (window.Chart) render();
  }, { once: true });

  document.querySelector('#open-expense').addEventListener('click', openExpenseDialog);
  document.querySelector('#close-dialog').addEventListener('click', closeExpenseDialog);
  document.querySelector('#next-step').addEventListener('click', showCategoryStep);
  elements.expenseForm.addEventListener('submit', (event) => event.preventDefault());
  elements.dialog.addEventListener('click', (event) => {
    if (event.target === elements.dialog) closeExpenseDialog();
  });
  elements.themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    expenseChart?.update();
  });
  for (const tab of elements.viewTabs) tab.addEventListener('click', () => switchView(tab.dataset.view));
  elements.monthPicker.addEventListener('change', () => selectMonth(elements.monthPicker.value));
  document.querySelector('#previous-month').addEventListener('click', () => moveMonth(-1));
  document.querySelector('#next-month').addEventListener('click', () => moveMonth(1));
  document.querySelector('#export-csv').addEventListener('click', exportCsv);
  document.querySelector('#export-json').addEventListener('click', exportJson);
  document.querySelector('#import-json').addEventListener('click', () => elements.importFile.click());
  document.querySelector('#clear-month').addEventListener('click', clearMonth);
  elements.importFile.addEventListener('change', async () => {
    const [file] = elements.importFile.files;
    if (file) await importJson(file);
    elements.importFile.value = '';
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      elements.storageStatus.textContent = 'Офлайн-режим доступен после установки приложения';
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
