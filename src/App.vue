<script setup>
import { computed, nextTick, onMounted, reactive, ref, toRaw, watch } from 'vue';
import dayjs from 'dayjs';
import appIconUrl from './assets/app-icon.png';

const DEFAULT_ENTRY_DATE = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
const mainTab = ref('entry');
const entryTab = ref('day');
const queryTab = ref('day');
const entryYear = ref(dayjs().format('YYYY'));
const entryMonthKey = ref(dayjs().format('YYYY-MM'));
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const importPath = ref('');
const newBookName = ref('');
const activeBookId = ref(null);
const bookDrafts = reactive({});
const monthlyDrafts = reactive({});
const yearlyDrafts = reactive({});
const webdavForm = reactive({ directory: '', username: '', password: '', enabled: false, autoSyncMinutes: '10' });
const queryFilters = reactive({
  dayMonth: dayjs().format('YYYY-MM'),
  monthFrom: dayjs().format('YYYY-MM'),
  monthTo: dayjs().format('YYYY-MM'),
  yearFrom: dayjs().format('YYYY'),
  yearTo: dayjs().format('YYYY'),
});

const state = reactive({
  books: [],
  totals: { totalRoyalty: 0, activeDays: 0, entryCount: 0 },
  daySummary: [],
  monthSummary: [],
  yearSummary: [],
  meta: {
    dbPath: '',
    lastImportPath: '',
    lastImportAt: '',
    defaultImportPath: '',
    webdav: { directory: '', fileName: '', fileUrl: '', username: '', password: '', enabled: false, autoSyncMinutes: 10, lastSyncAt: '', lastSyncStatus: '', lastSyncMessage: '' },
  },
});

const form = reactive({ entryDate: DEFAULT_ENTRY_DATE, amounts: {} });

const activeBook = computed(() => state.books.find((book) => book.id === activeBookId.value) || null);
const activeBookAmount = computed({
  get: () => (activeBookId.value ? form.amounts[activeBookId.value] ?? '' : ''),
  set: (value) => { if (activeBookId.value) form.amounts[activeBookId.value] = value; },
});
const entryTotal = computed(() => state.books.reduce((sum, book) => sum + Number(form.amounts[book.id] || 0), 0));
const currentYear = dayjs().format('YYYY');
const monthYears = computed(() => [...new Set([currentYear, ...state.monthSummary.map((item) => item.monthKey.slice(0, 4)), ...state.yearSummary.map((item) => item.yearKey)])].sort((a, b) => b.localeCompare(a)));
const visibleEntryMonths = computed(() => {
  const monthMap = new Map(state.monthSummary.map((item) => [item.monthKey, item]));
  return Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;
    const monthKey = `${entryYear.value}-${String(monthNumber).padStart(2, '0')}`;
    return monthMap.get(monthKey) || {
      monthKey,
      monthLabel: `${monthNumber}月`,
      totalFee: 0,
      actualTotal: 0,
      afterTaxTotal: 0,
      tax: 0,
      books: state.books.map((book) => ({
        bookId: book.id,
        bookName: book.name,
        totalFee: 0,
        actualTotal: 0,
        afterTaxTotal: 0,
        tax: 0,
      })),
    };
  });
});
const currentEntryMonth = computed(() => visibleEntryMonths.value.find((item) => item.monthKey === entryMonthKey.value) || visibleEntryMonths.value[dayjs().month()] || visibleEntryMonths.value[0] || null);
const selectedEntryYearMonths = computed(() =>
  state.monthSummary
    .filter((item) => item.monthKey.startsWith(`${entryYear.value}-`))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
);
const currentMonthBooks = computed(() => {
  if (!currentEntryMonth.value) return [];
  return state.books.map((book) => {
    const monthBook = currentEntryMonth.value.books?.find((item) => item.bookId === book.id);
    const draft = monthlyDrafts[currentEntryMonth.value.monthKey]?.[book.id] || { actualTotal: '', afterTaxTotal: '' };
    const actualTotal = Number(draft.actualTotal || 0);
    const afterTaxTotal = Number(draft.afterTaxTotal || 0);
    return {
      bookId: book.id,
      bookName: book.name,
      totalFee: Number(monthBook?.totalFee || 0),
      actualTotal: draft.actualTotal,
      afterTaxTotal: draft.afterTaxTotal,
      tax: Number((actualTotal - afterTaxTotal).toFixed(2)),
    };
  });
});
const hasCurrentMonthBookValues = computed(() => currentMonthBooks.value.some((item) => item.actualTotal !== '' || item.afterTaxTotal !== ''));
const filteredDayRows = computed(() => state.daySummary.filter((item) => {
  if (queryFilters.dayMonth && !item.entryDate.startsWith(queryFilters.dayMonth)) return false;
  return true;
}));
const filteredMonthRows = computed(() => state.monthSummary.filter((item) => {
  if (queryFilters.monthFrom && item.monthKey < queryFilters.monthFrom) return false;
  if (queryFilters.monthTo && item.monthKey > queryFilters.monthTo) return false;
  return true;
}));
const filteredYearRows = computed(() => state.yearSummary.filter((item) => {
  if (queryFilters.yearFrom && item.yearKey < queryFilters.yearFrom) return false;
  if (queryFilters.yearTo && item.yearKey > queryFilters.yearTo) return false;
  return true;
}));
const yearOptions = computed(() => [...new Set(state.yearSummary.map((item) => item.yearKey))].sort((a, b) => b.localeCompare(a)));
const monthOptions = computed(() =>
  [...new Map(state.monthSummary.map((item) => [item.monthKey, { value: item.monthKey, label: `${item.monthKey} · ${item.monthLabel}` }])).values()]
    .sort((a, b) => b.value.localeCompare(a.value))
);
const dayMonthOptions = computed(() =>
  [...new Set(state.daySummary.map((item) => item.entryDate.slice(0, 7)))]
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: value }))
);
const recentDayRows = computed(() => {
  const selectedMonth = String(form.entryDate || '').slice(0, 7);
  const rows = selectedMonth
    ? state.daySummary.filter((item) => item.entryDate.startsWith(selectedMonth))
    : state.daySummary;
  return rows.slice(0, 12);
});
const dayTotal = computed(() => filteredDayRows.value.reduce((sum, item) => sum + Number(item.total || 0), 0));
const monthTotal = computed(() => filteredMonthRows.value.reduce((sum, item) => sum + Number(item.totalFee || 0), 0));
const currentMonthTotals = computed(() => {
  const baseTotals = currentMonthBooks.value.reduce((sum, item) => ({
    totalFee: sum.totalFee + Number(item.totalFee || 0),
    actualTotal: sum.actualTotal + Number(item.actualTotal || 0),
    afterTaxTotal: sum.afterTaxTotal + Number(item.afterTaxTotal || 0),
    tax: sum.tax + Number(item.tax || 0),
  }), { totalFee: 0, actualTotal: 0, afterTaxTotal: 0, tax: 0 });
  if (!currentEntryMonth.value) return baseTotals;
  if (!hasCurrentMonthBookValues.value) {
    return {
      totalFee: Number(currentEntryMonth.value.totalFee || 0),
      actualTotal: Number(currentEntryMonth.value.actualTotal || 0),
      afterTaxTotal: Number(currentEntryMonth.value.afterTaxTotal || 0),
      tax: Number(currentEntryMonth.value.tax || 0),
    };
  }
  return baseTotals;
});
const monthRangeTotals = computed(() => filteredMonthRows.value.reduce((sum, item) => ({
  totalFee: sum.totalFee + Number(item.totalFee || 0),
  actualTotal: sum.actualTotal + Number(item.actualTotal || 0),
  afterTaxTotal: sum.afterTaxTotal + Number(item.afterTaxTotal || 0),
  tax: sum.tax + Number(item.tax || 0),
}), { totalFee: 0, actualTotal: 0, afterTaxTotal: 0, tax: 0 }));
const yearRangeTotals = computed(() => filteredYearRows.value.reduce((sum, item) => ({
  totalFee: sum.totalFee + Number(item.totalFee || 0),
  actualTotal: sum.actualTotal + Number(item.actualTotal || 0),
  afterTaxTotal: sum.afterTaxTotal + Number(item.afterTaxTotal || 0),
  tax: sum.tax + Number(item.tax || 0),
  refundAmount: sum.refundAmount + Number(item.refundAmount || 0),
  actualIncome: sum.actualIncome + Number(item.actualIncome || 0),
}), { totalFee: 0, actualTotal: 0, afterTaxTotal: 0, tax: 0, refundAmount: 0, actualIncome: 0 }));

function flash(message) {
  successMessage.value = message;
  setTimeout(() => { if (successMessage.value === message) successMessage.value = ''; }, 2200);
}
function clearMessages() { errorMessage.value = ''; }
function formatCurrency(value) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(Number(value || 0));
}
function formatBeijingTime(value) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
function buildWebDavPayload() {
  return {
    directory: String(webdavForm.directory || ''),
    username: String(webdavForm.username || ''),
    password: String(webdavForm.password || ''),
    enabled: !!webdavForm.enabled,
    autoSyncMinutes: String(webdavForm.autoSyncMinutes || '10'),
  };
}
function patchFormAmounts(next) {
  Object.keys(form.amounts).forEach((key) => {
    if (!(key in next)) delete form.amounts[key];
  });
  Object.entries(next).forEach(([key, value]) => {
    form.amounts[key] = value;
  });
}
function ensureQueryFilters() {
  const fallbackDayMonth = dayMonthOptions.value[0]?.value || dayjs().format('YYYY-MM');
  if (!dayMonthOptions.value.some((item) => item.value === queryFilters.dayMonth)) {
    queryFilters.dayMonth = fallbackDayMonth;
  }

  const fallbackMonth = monthOptions.value[0]?.value || dayjs().format('YYYY-MM');
  if (!monthOptions.value.some((item) => item.value === queryFilters.monthFrom)) {
    queryFilters.monthFrom = fallbackMonth;
  }
  if (!monthOptions.value.some((item) => item.value === queryFilters.monthTo)) {
    queryFilters.monthTo = queryFilters.monthFrom;
  }
  if (queryFilters.monthFrom && queryFilters.monthTo && queryFilters.monthFrom > queryFilters.monthTo) {
    queryFilters.monthTo = queryFilters.monthFrom;
  }

  const fallbackYear = yearOptions.value[0] || dayjs().format('YYYY');
  if (!yearOptions.value.includes(queryFilters.yearFrom)) {
    queryFilters.yearFrom = fallbackYear;
  }
  if (!yearOptions.value.includes(queryFilters.yearTo)) {
    queryFilters.yearTo = queryFilters.yearFrom;
  }
  if (queryFilters.yearFrom && queryFilters.yearTo && queryFilters.yearFrom > queryFilters.yearTo) {
    queryFilters.yearTo = queryFilters.yearFrom;
  }
}
function ensureMaps() {
  const next = {};
  state.books.forEach((book) => {
    if (bookDrafts[book.id] === undefined) bookDrafts[book.id] = book.name;
    next[book.id] = form.amounts[book.id] ?? '';
  });
  patchFormAmounts(next);
  if (!activeBookId.value && state.books.length) activeBookId.value = state.books[0].id;
}
function hydrateDashboard(data) {
  state.books = data.books || [];
  state.totals = data.totals || state.totals;
  state.daySummary = data.daySummary || [];
  state.monthSummary = data.monthSummary || [];
  state.yearSummary = data.yearSummary || [];
  state.meta = data.meta || state.meta;
  importPath.value = state.meta.lastImportPath || state.meta.defaultImportPath || importPath.value;
  webdavForm.directory = state.meta.webdav?.directory || '';
  webdavForm.username = state.meta.webdav?.username || '';
  webdavForm.password = state.meta.webdav?.password || '';
  webdavForm.enabled = !!state.meta.webdav?.enabled;
  webdavForm.autoSyncMinutes = String(state.meta.webdav?.autoSyncMinutes || 10);
  state.monthSummary.forEach((month) => {
    if (!monthlyDrafts[month.monthKey]) monthlyDrafts[month.monthKey] = {};
    state.books.forEach((book) => {
      const monthBook = month.books?.find((item) => item.bookId === book.id);
      monthlyDrafts[month.monthKey][book.id] = {
        actualTotal: monthBook?.actualTotal ? String(monthBook.actualTotal) : '',
        afterTaxTotal: monthBook?.afterTaxTotal ? String(monthBook.afterTaxTotal) : '',
      };
    });
  });
  state.yearSummary.forEach((year) => {
    yearlyDrafts[year.yearKey] = year.refundAmount ? String(year.refundAmount) : '';
  });
  monthYears.value.forEach((year) => {
    if (yearlyDrafts[year] === undefined) yearlyDrafts[year] = '';
  });
  visibleEntryMonths.value.forEach((month) => {
    if (!monthlyDrafts[month.monthKey]) monthlyDrafts[month.monthKey] = {};
    state.books.forEach((book) => {
      if (!monthlyDrafts[month.monthKey][book.id]) monthlyDrafts[month.monthKey][book.id] = { actualTotal: '', afterTaxTotal: '' };
    });
  });
  const currentDay = DEFAULT_ENTRY_DATE;
  const currentMonth = dayjs().format('YYYY-MM');
  const currentYear = dayjs().format('YYYY');
  const latestDay = state.daySummary[0]?.entryDate || currentDay;
  const latestMonth = state.monthSummary[0]?.monthKey || latestDay.slice(0, 7) || currentMonth;
  const latestYear = state.yearSummary[0]?.yearKey || latestMonth.slice(0, 4) || currentYear;

  if (!state.daySummary.some((item) => item.entryDate === form.entryDate)) {
    form.entryDate = latestDay;
  }

  if (!queryFilters.dayMonth) {
    queryFilters.dayMonth = state.daySummary.some((item) => item.entryDate.startsWith(currentMonth)) ? currentMonth : latestDay.slice(0, 7);
  }
  if (!queryFilters.monthFrom) {
    queryFilters.monthFrom = state.monthSummary.some((item) => item.monthKey === currentMonth) ? currentMonth : latestMonth;
  }
  if (!queryFilters.monthTo) {
    queryFilters.monthTo = queryFilters.monthFrom;
  }
  if (!queryFilters.yearFrom) {
    queryFilters.yearFrom = state.yearSummary.some((item) => item.yearKey === currentYear) ? currentYear : latestYear;
  }
  if (!queryFilters.yearTo) {
    queryFilters.yearTo = queryFilters.yearFrom;
  }
  ensureQueryFilters();

  if (!state.monthSummary.some((item) => item.monthKey.startsWith(`${entryYear.value}-`))) {
    entryYear.value = latestYear;
  }
  if (!state.monthSummary.some((item) => item.monthKey === entryMonthKey.value)) {
    entryMonthKey.value = latestMonth;
  }
  ensureMaps();
}
async function loadDateEntries(entryDate) {
  const data = await window.royaltyApi.loadDateEntries(entryDate);
  const next = {};
  state.books.forEach((book) => { next[book.id] = data.amounts?.[book.id] ?? data.amounts?.[String(book.id)] ?? ''; });
  patchFormAmounts(next);
}
async function loadDashboard() {
  loading.value = true;
  clearMessages();
  try {
    const data = await window.royaltyApi.loadDashboard();
    hydrateDashboard(data);
    await loadDateEntries(form.entryDate);
  } catch (error) {
    errorMessage.value = error?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}
async function withBusy(task, successText) {
  busy.value = true;
  clearMessages();
  try {
    const result = await task();
    if (successText) flash(successText);
    return result;
  } catch (error) {
    errorMessage.value = error?.message || '操作失败';
    throw error;
  } finally {
    busy.value = false;
  }
}
async function saveEntry() {
  const entryDate = String(form.entryDate || '').trim();
  if (!entryDate) {
    throw new Error('请选择录入日期后再保存');
  }
  const amounts = JSON.parse(JSON.stringify(toRaw(form.amounts)));
  const data = await withBusy(() => window.royaltyApi.saveEntry({ entryDate, amounts }), '已保存');
  hydrateDashboard(data);
  await loadDateEntries(entryDate);
}
async function addBook() {
  if (!newBookName.value.trim()) return;
  const data = await withBusy(() => window.royaltyApi.createBook(newBookName.value.trim()), '已新增书籍');
  newBookName.value = '';
  hydrateDashboard(data);
}
async function renameBook(book) {
  const name = String(bookDrafts[book.id] || '').trim();
  if (!name || name === book.name) return;
  const data = await withBusy(() => window.royaltyApi.updateBook({ id: book.id, name }), '已修改书名');
  hydrateDashboard(data);
}
async function removeBook(book) {
  if (!confirm(`删除《${book.name}》及其全部记录？`)) return;
  const data = await withBusy(() => window.royaltyApi.deleteBook(book.id), '已删除书籍');
  hydrateDashboard(data);
  await loadDateEntries(form.entryDate);
}
async function importExcel() {
  const result = await withBusy(() => window.royaltyApi.importExcel(importPath.value.trim()), '已导入 Excel');
  if (!result.cancelled) {
    hydrateDashboard(result.data);
    await loadDateEntries(form.entryDate);
  }
}
async function pickExcelFile() {
  const filePath = await window.royaltyApi.pickExcelFile();
  if (filePath) importPath.value = filePath;
}
async function exportDatabase() {
  const filePath = await withBusy(() => window.royaltyApi.exportDatabase(), '已导出备份');
  if (!filePath) successMessage.value = '';
}
async function saveMonth(monthKey) {
  const books = state.books.map((book) => ({
    bookId: book.id,
    actualTotal: monthlyDrafts[monthKey]?.[book.id]?.actualTotal ?? '',
    afterTaxTotal: monthlyDrafts[monthKey]?.[book.id]?.afterTaxTotal ?? '',
  }));
  const data = await withBusy(() => window.royaltyApi.saveMonthFinancials({ monthKey, books }), '已保存月份');
  hydrateDashboard(data);
}
async function saveYear(yearKey) {
  const data = await withBusy(() => window.royaltyApi.saveYearFinancials({ yearKey, refundAmount: yearlyDrafts[yearKey] ?? '' }), '已保存年度退税');
  hydrateDashboard(data);
}
async function saveWebDavConfig() {
  const config = await withBusy(() => window.royaltyApi.saveWebDavConfig(buildWebDavPayload()), '已保存设置');
  state.meta.webdav = { ...state.meta.webdav, ...config };
}
async function testWebDav() {
  const config = await withBusy(() => window.royaltyApi.testWebDav(buildWebDavPayload()), '连接成功');
  state.meta.webdav = { ...state.meta.webdav, ...config };
}
async function pushWebDav() {
  const config = await withBusy(() => window.royaltyApi.pushWebDav(), '已上传');
  state.meta.webdav = { ...state.meta.webdav, ...config };
}
async function pullWebDav() {
  const data = await withBusy(() => window.royaltyApi.pullWebDav(), '已下载');
  hydrateDashboard(data);
  await loadDateEntries(form.entryDate);
}
function jumpDate(offset) { form.entryDate = dayjs(form.entryDate).add(offset, 'day').format('YYYY-MM-DD'); }
async function editDay(entryDate) {
  mainTab.value = 'entry';
  entryTab.value = 'day';
  form.entryDate = entryDate;
  await nextTick();
  document.querySelector('.page-shell')?.scrollTo({ top: 0, behavior: 'smooth' });
}
async function openDbFolder() { await window.royaltyApi.openDbFolder(); }
async function minimizeWindow() { await window.royaltyApi.minimizeWindow(); }
async function closeWindow() { await window.royaltyApi.closeWindow(); }

watch(entryYear, (value) => {
  const currentMonthPart = String(entryMonthKey.value || '').slice(5, 7) || String(dayjs().month() + 1).padStart(2, '0');
  entryMonthKey.value = `${value}-${currentMonthPart}`;
});

watch(() => queryFilters.monthFrom, (value) => {
  if (queryFilters.monthTo && value && queryFilters.monthTo < value) queryFilters.monthTo = value;
});

watch(() => queryFilters.yearFrom, (value) => {
  if (queryFilters.yearTo && value && queryFilters.yearTo < value) queryFilters.yearTo = value;
});

watch(() => form.entryDate, async (value) => {
  if (!loading.value && value) await loadDateEntries(value);
});

onMounted(loadDashboard);
</script>

<template>
  <div class="app-shell">
    <header class="window-bar">
      <div class="window-drag">
        <img class="brand-mark" :src="appIconUrl" alt="小说稿费记录器" />
        <div class="brand-text">小说稿费记录器</div>
      </div>
      <div class="window-actions no-drag">
        <button class="window-btn" aria-label="最小化" @click="minimizeWindow"><span class="win-icon min"></span></button>
        <button class="window-btn close" aria-label="关闭" @click="closeWindow"><span class="win-icon close-icon"></span></button>
      </div>
    </header>

    <div class="page-shell">
      <header class="topbar">
        <div>
          <h1>小说稿费记录器</h1>
        </div>
        <nav class="main-tabs">
          <button :class="['main-tab', { active: mainTab === 'entry' }]" @click="mainTab = 'entry'">录入</button>
          <button :class="['main-tab', { active: mainTab === 'query' }]" @click="mainTab = 'query'">查询</button>
          <button :class="['main-tab', { active: mainTab === 'settings' }]" @click="mainTab = 'settings'">设置</button>
        </nav>
      </header>

      <div class="page-content">
        <section v-if="errorMessage" class="banner error">{{ errorMessage }}</section>
        <section v-if="successMessage" class="banner success">{{ successMessage }}</section>
        <section v-if="loading" class="panel loading-panel">正在加载...</section>

        <template v-else>
        <section v-if="mainTab === 'entry'" class="entry-layout compact-layout">
          <div class="entry-main-stack">
            <nav class="sub-tabs">
              <button :class="['sub-tab', { active: entryTab === 'day' }]" @click="entryTab = 'day'">每日稿费录入</button>
              <button :class="['sub-tab', { active: entryTab === 'month' }]" @click="entryTab = 'month'">每月稿费录入</button>
            </nav>

            <article v-if="entryTab === 'day'" class="panel entry-panel">
              <div class="entry-header">
                <div class="entry-date-block">
                  <button class="ghost small" @click="jumpDate(-1)">前一天</button>
                  <input v-model="form.entryDate" type="date" />
                  <button class="ghost small" @click="form.entryDate = DEFAULT_ENTRY_DATE">昨天</button>
                  <button class="ghost small" @click="form.entryDate = dayjs().format('YYYY-MM-DD')">今天</button>
                  <button class="ghost small" @click="jumpDate(1)">后一天</button>
                </div>
                <div class="entry-total-card">{{ formatCurrency(entryTotal) }}</div>
              </div>

              <div class="book-tabs">
                <button
                  v-for="book in state.books"
                  :key="book.id"
                  :class="['book-tab', { active: activeBookId === book.id }]"
                  @click="activeBookId = book.id"
                >
                  {{ book.name }}
                </button>
              </div>

              <div v-if="activeBook" class="focus-row">
                <div class="focus-book">{{ activeBook.name }}</div>
                <input v-model="activeBookAmount" class="focus-money" type="number" min="0" step="0.01" placeholder="0.00" />
                <button class="primary save-main" :disabled="busy" @click="saveEntry">保存</button>
              </div>

              <div class="mini-grid">
                <label v-for="book in state.books" :key="book.id" class="mini-card">
                  <span>{{ book.name }}</span>
                  <input v-model="form.amounts[book.id]" type="number" min="0" step="0.01" placeholder="0.00" />
                </label>
              </div>
            </article>

            <article v-else class="month-list">
              <div class="panel month-toolbar">
                <div class="month-year-tabs">
                  <button
                    v-for="year in monthYears"
                    :key="year"
                    :class="['year-chip', { active: entryYear === year }]"
                    @click="entryYear = year"
                  >
                    {{ year }}
                  </button>
                </div>
                <div class="month-chip-row">
                  <button
                    v-for="month in visibleEntryMonths"
                    :key="month.monthKey"
                    :class="['month-chip', { active: entryMonthKey === month.monthKey }]"
                    @click="entryMonthKey = month.monthKey"
                  >
                    {{ month.monthLabel }}
                  </button>
                </div>
              </div>

              <div v-if="currentEntryMonth" class="panel month-panel current-month-panel">
                <div class="month-top">
                  <div>
                    <h2>{{ currentEntryMonth.monthLabel }}</h2>
                    <div class="month-key">{{ currentEntryMonth.monthKey }}</div>
                  </div>
                  <div class="month-fee">{{ formatCurrency(currentMonthTotals.totalFee) }}</div>
                </div>
                <div class="month-summary-strip">
                  <div class="summary-chip">
                    <span>税前合计</span>
                    <strong>{{ formatCurrency(currentMonthTotals.totalFee) }}</strong>
                  </div>
                  <div class="summary-chip">
                    <span>实际合计</span>
                    <strong>{{ formatCurrency(currentMonthTotals.actualTotal) }}</strong>
                  </div>
                  <div class="summary-chip">
                    <span>税后合计</span>
                    <strong>{{ formatCurrency(currentMonthTotals.afterTaxTotal) }}</strong>
                  </div>
                  <div class="summary-chip">
                    <span>税额合计</span>
                    <strong>{{ formatCurrency(currentMonthTotals.tax) }}</strong>
                  </div>
                </div>
                <div class="month-book-table">
                  <div class="month-book-head month-book-row">
                    <span>书籍</span>
                    <span>税前稿费</span>
                    <span>实际稿费</span>
                    <span>税后稿费</span>
                    <span>税额</span>
                  </div>
                  <div v-for="book in currentMonthBooks" :key="`${currentEntryMonth.monthKey}-${book.bookId}`" class="month-book-row">
                    <strong>{{ book.bookName }}</strong>
                    <span>{{ formatCurrency(book.totalFee) }}</span>
                    <input v-model="monthlyDrafts[currentEntryMonth.monthKey][book.bookId].actualTotal" type="number" min="0" step="0.01" placeholder="0.00" />
                    <input v-model="monthlyDrafts[currentEntryMonth.monthKey][book.bookId].afterTaxTotal" type="number" min="0" step="0.01" placeholder="0.00" />
                    <span class="tax-inline">{{ formatCurrency(book.tax) }}</span>
                  </div>
                  <div class="month-book-row total-row">
                    <strong>合计</strong>
                    <strong>{{ formatCurrency(currentMonthTotals.totalFee) }}</strong>
                    <strong>{{ formatCurrency(currentMonthTotals.actualTotal) }}</strong>
                    <strong>{{ formatCurrency(currentMonthTotals.afterTaxTotal) }}</strong>
                    <strong>{{ formatCurrency(currentMonthTotals.tax) }}</strong>
                  </div>
                </div>
                <div class="month-action-row">
                  <button class="primary save-month-btn" :disabled="busy" @click="saveMonth(currentEntryMonth.monthKey)">保存本月</button>
                </div>
              </div>

              <div class="panel year-refund-panel">
                <div class="month-top">
                  <div>
                    <h2>{{ entryYear }}年退税</h2>
                    <div class="month-key">年度实际总收入 = 税后总收入 + 退税金额</div>
                  </div>
                  <div class="month-fee">{{ formatCurrency(state.yearSummary.find((item) => item.yearKey === entryYear)?.actualIncome || 0) }}</div>
                </div>
                <div class="year-refund-row">
                  <label class="field">
                    <span>退税金额</span>
                    <input v-model="yearlyDrafts[entryYear]" type="number" min="0" step="0.01" placeholder="0.00" />
                  </label>
                  <div class="summary-chip compact-chip">
                    <span>税后总收入</span>
                    <strong>{{ formatCurrency(state.yearSummary.find((item) => item.yearKey === entryYear)?.afterTaxTotal || 0) }}</strong>
                  </div>
                  <div class="summary-chip compact-chip">
                    <span>年度实际总收入</span>
                    <strong>{{ formatCurrency((Number(state.yearSummary.find((item) => item.yearKey === entryYear)?.afterTaxTotal || 0) + Number(yearlyDrafts[entryYear] || 0)).toFixed(2)) }}</strong>
                  </div>
                  <button class="primary save-month-btn" :disabled="busy" @click="saveYear(entryYear)">保存年度</button>
                </div>
              </div>
            </article>
          </div>

          <aside class="panel side-panel">
            <template v-if="entryTab === 'day'">
              <h2>最近日期</h2>
              <div class="quick-list">
                <button v-for="day in recentDayRows" :key="day.entryDate" class="quick-item" @click="form.entryDate = day.entryDate">
                  <span>{{ day.entryDate }}</span>
                  <strong>{{ formatCurrency(day.total) }}</strong>
                </button>
              </div>
            </template>
            <template v-else>
              <h2>月份概览</h2>
              <div class="quick-list">
                <div v-for="month in selectedEntryYearMonths.slice(0, 12)" :key="month.monthKey" class="quick-item static-item">
                  <span>{{ month.monthLabel }}</span>
                  <strong>{{ formatCurrency(month.totalFee) }}</strong>
                </div>
              </div>
            </template>
          </aside>
        </section>

        <section v-else-if="mainTab === 'query'" class="query-layout">
          <nav class="sub-tabs">
            <button :class="['sub-tab', { active: queryTab === 'day' }]" @click="queryTab = 'day'">按天</button>
            <button :class="['sub-tab', { active: queryTab === 'month' }]" @click="queryTab = 'month'">按月</button>
            <button :class="['sub-tab', { active: queryTab === 'year' }]" @click="queryTab = 'year'">按年</button>
          </nav>

          <article v-if="queryTab === 'day'" class="panel table-panel">
            <div class="query-toolbar">
              <div class="query-filters">
                <label class="field compact-field">
                  <span>查询月份</span>
                  <select v-model="queryFilters.dayMonth" class="query-input" :disabled="!dayMonthOptions.length">
                    <option v-if="!dayMonthOptions.length" value="">暂无数据</option>
                    <option v-for="month in dayMonthOptions" :key="`day-month-${month.value}`" :value="month.value">{{ month.label }}</option>
                  </select>
                </label>
              </div>
              <div class="query-total">合计 {{ formatCurrency(dayTotal) }}</div>
            </div>
            <div class="table-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>金额</th>
                    <th>书数</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="day in filteredDayRows" :key="day.entryDate">
                    <td>{{ day.entryDate }}</td>
                    <td>{{ formatCurrency(day.total) }}</td>
                    <td>{{ day.bookCount }}</td>
                    <td><button class="ghost small" @click="editDay(day.entryDate)">编辑</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article v-else-if="queryTab === 'month'" class="panel table-panel">
            <div class="query-toolbar">
              <div class="query-filters">
                <label class="field compact-field">
                  <span>开始月份</span>
                  <select v-model="queryFilters.monthFrom" class="query-input" :disabled="!monthOptions.length">
                    <option v-if="!monthOptions.length" value="">暂无数据</option>
                    <option v-for="month in monthOptions" :key="`from-month-${month.value}`" :value="month.value">{{ month.label }}</option>
                  </select>
                </label>
                <label class="field compact-field">
                  <span>结束月份</span>
                  <select v-model="queryFilters.monthTo" class="query-input" :disabled="!monthOptions.length">
                    <option v-if="!monthOptions.length" value="">暂无数据</option>
                    <option v-for="month in monthOptions" :key="`to-month-${month.value}`" :value="month.value">{{ month.label }}</option>
                  </select>
                </label>
              </div>
              <div class="query-total query-total-grid">
                <span>税前 {{ formatCurrency(monthRangeTotals.totalFee) }}</span>
                <span>实际 {{ formatCurrency(monthRangeTotals.actualTotal) }}</span>
                <span>税后 {{ formatCurrency(monthRangeTotals.afterTaxTotal) }}</span>
                <span>税额 {{ formatCurrency(monthRangeTotals.tax) }}</span>
              </div>
            </div>
            <div class="table-scroll">
              <div class="grouped-summary-list">
              <section v-for="month in filteredMonthRows" :key="month.monthKey" class="group-card">
                <div class="group-card-header">
                  <div>
                    <h3>{{ month.monthLabel }}</h3>
                    <div class="month-key">{{ month.monthKey }}</div>
                  </div>
                  <div class="group-totals">
                    <span>税前 {{ formatCurrency(month.totalFee) }}</span>
                    <span>实际 {{ formatCurrency(month.actualTotal) }}</span>
                    <span>税后 {{ formatCurrency(month.afterTaxTotal) }}</span>
                    <span>税额 {{ formatCurrency(month.tax) }}</span>
                  </div>
                </div>
                <table class="data-table nested-table">
                  <thead>
                    <tr>
                      <th>书籍</th>
                      <th>税前</th>
                      <th>实际</th>
                      <th>税后</th>
                      <th>税额</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="book in month.books" :key="`${month.monthKey}-${book.bookId}`">
                      <td>{{ book.bookName }}</td>
                      <td>{{ formatCurrency(book.totalFee) }}</td>
                      <td>{{ formatCurrency(book.actualTotal) }}</td>
                      <td>{{ formatCurrency(book.afterTaxTotal) }}</td>
                      <td>{{ formatCurrency(book.tax) }}</td>
                    </tr>
                    <tr v-if="!month.books.some((book) => book.actualTotal || book.afterTaxTotal || book.tax) && (month.actualTotal || month.afterTaxTotal || month.tax)">
                      <td>导入汇总</td>
                      <td>{{ formatCurrency(month.totalFee) }}</td>
                      <td>{{ formatCurrency(month.actualTotal) }}</td>
                      <td>{{ formatCurrency(month.afterTaxTotal) }}</td>
                      <td>{{ formatCurrency(month.tax) }}</td>
                    </tr>
                    <tr class="total-row">
                      <td>合计</td>
                      <td>{{ formatCurrency(month.totalFee) }}</td>
                      <td>{{ formatCurrency(month.actualTotal) }}</td>
                      <td>{{ formatCurrency(month.afterTaxTotal) }}</td>
                      <td>{{ formatCurrency(month.tax) }}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
              </div>
            </div>
          </article>

          <article v-else class="panel table-panel">
            <div class="query-toolbar">
              <div class="query-filters">
                <label class="field compact-field">
                  <span>开始年份</span>
                  <select v-model="queryFilters.yearFrom" class="query-input" :disabled="!yearOptions.length">
                    <option v-if="!yearOptions.length" value="">暂无数据</option>
                    <option v-for="year in yearOptions" :key="`from-${year}`" :value="year">{{ year }}</option>
                  </select>
                </label>
                <label class="field compact-field">
                  <span>结束年份</span>
                  <select v-model="queryFilters.yearTo" class="query-input" :disabled="!yearOptions.length">
                    <option v-if="!yearOptions.length" value="">暂无数据</option>
                    <option v-for="year in yearOptions" :key="`to-${year}`" :value="year">{{ year }}</option>
                  </select>
                </label>
              </div>
              <div class="query-total query-total-grid">
                <span>税前 {{ formatCurrency(yearRangeTotals.totalFee) }}</span>
                <span>实际 {{ formatCurrency(yearRangeTotals.actualTotal) }}</span>
                <span>税后 {{ formatCurrency(yearRangeTotals.afterTaxTotal) }}</span>
                <span>税额 {{ formatCurrency(yearRangeTotals.tax) }}</span>
                <span>退税 {{ formatCurrency(yearRangeTotals.refundAmount) }}</span>
                <span>实际总收入 {{ formatCurrency(yearRangeTotals.actualIncome) }}</span>
              </div>
            </div>
            <div class="table-scroll">
              <div class="grouped-summary-list">
              <section v-for="year in filteredYearRows" :key="year.yearKey" class="group-card">
                <div class="group-card-header">
                  <div>
                    <h3>{{ year.yearKey }}年</h3>
                  </div>
                  <div class="group-totals">
                    <span>税前 {{ formatCurrency(year.totalFee) }}</span>
                    <span>实际 {{ formatCurrency(year.actualTotal) }}</span>
                    <span>税后 {{ formatCurrency(year.afterTaxTotal) }}</span>
                    <span>税额 {{ formatCurrency(year.tax) }}</span>
                    <span>退税 {{ formatCurrency(year.refundAmount) }}</span>
                    <span>实际总收入 {{ formatCurrency(year.actualIncome) }}</span>
                  </div>
                </div>
                <table class="data-table nested-table">
                  <thead>
                    <tr>
                      <th>书籍</th>
                      <th>税前</th>
                      <th>实际</th>
                      <th>税后</th>
                      <th>税额</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="book in year.books" :key="`${year.yearKey}-${book.bookId}`">
                      <td>{{ book.bookName }}</td>
                      <td>{{ formatCurrency(book.totalFee) }}</td>
                      <td>{{ formatCurrency(book.actualTotal) }}</td>
                      <td>{{ formatCurrency(book.afterTaxTotal) }}</td>
                      <td>{{ formatCurrency(book.tax) }}</td>
                    </tr>
                    <tr v-if="!year.books.some((book) => book.actualTotal || book.afterTaxTotal || book.tax) && (year.actualTotal || year.afterTaxTotal || year.tax)">
                      <td>导入汇总</td>
                      <td>{{ formatCurrency(year.totalFee) }}</td>
                      <td>{{ formatCurrency(year.actualTotal) }}</td>
                      <td>{{ formatCurrency(year.afterTaxTotal) }}</td>
                      <td>{{ formatCurrency(year.tax) }}</td>
                    </tr>
                    <tr class="total-row">
                      <td>合计</td>
                      <td>{{ formatCurrency(year.totalFee) }}</td>
                      <td>{{ formatCurrency(year.actualTotal) }}</td>
                      <td>{{ formatCurrency(year.afterTaxTotal) }}</td>
                      <td>{{ formatCurrency(year.tax) }}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
              </div>
            </div>
          </article>
        </section>

        <section v-else class="settings-layout">
          <article class="panel settings-card">
            <h2>书籍管理</h2>
            <div class="inline-form top-gap inline-form-compact">
              <input v-model="newBookName" type="text" placeholder="新增书籍名称" @keydown.enter="addBook" />
              <button class="primary" :disabled="busy" @click="addBook">新增</button>
            </div>
            <div class="settings-book-list">
              <div v-for="book in state.books" :key="book.id" class="settings-book-item">
                <input v-model="bookDrafts[book.id]" type="text" />
                <button class="ghost small" :disabled="busy" @click="renameBook(book)">保存</button>
                <button class="danger small" :disabled="busy" @click="removeBook(book)">删除</button>
              </div>
            </div>
          </article>

          <article class="panel settings-card">
            <h2>数据</h2>
            <label class="field top-gap">
              <span>Excel 路径</span>
              <input v-model="importPath" type="text" />
            </label>
            <div class="button-row wrap-row top-gap">
              <button class="ghost" :disabled="busy" @click="pickExcelFile">选择文件</button>
              <button class="primary" :disabled="busy" @click="importExcel">导入 Excel</button>
              <button class="ghost" :disabled="busy" @click="exportDatabase">导出备份</button>
              <button class="ghost" @click="openDbFolder">打开目录</button>
            </div>
          </article>

          <article class="panel settings-card wide-settings">
            <h2>WebDAV</h2>
            <div class="settings-grid top-gap">
              <label class="field full-span">
                <span>目录</span>
                <input v-model="webdavForm.directory" type="text" placeholder="https://example.com/webdav/book-royalty" />
              </label>
              <label class="field">
                <span>用户名</span>
                <input v-model="webdavForm.username" type="text" />
              </label>
              <label class="field">
                <span>密码</span>
                <input v-model="webdavForm.password" type="password" />
              </label>
              <label class="field">
                <span>自动同步间隔（分钟）</span>
                <input v-model="webdavForm.autoSyncMinutes" type="number" min="1" step="1" />
              </label>
            </div>
            <label class="toggle-row">
              <input v-model="webdavForm.enabled" type="checkbox" />
              <span>自动同步</span>
            </label>
            <div class="button-row wrap-row top-gap">
              <button class="ghost" :disabled="busy" @click="saveWebDavConfig">保存配置</button>
              <button class="ghost" :disabled="busy" @click="testWebDav">测试</button>
              <button class="primary" :disabled="busy" @click="pushWebDav">上传</button>
              <button class="ghost" :disabled="busy" @click="pullWebDav">下载</button>
            </div>
            <div class="sync-status top-gap">
              <div>数据库文件：{{ state.meta.webdav.fileName || 'royalty-data.sqlite' }}</div>
              <div>远程文件：{{ state.meta.webdav.fileUrl || '未生成' }}</div>
              <div>最近同步：{{ formatBeijingTime(state.meta.webdav.lastSyncAt) }}</div>
              <div>状态：{{ state.meta.webdav.lastSyncStatus || '未同步' }}</div>
              <div>{{ state.meta.webdav.lastSyncMessage || '' }}</div>
            </div>
          </article>
        </section>
        </template>
      </div>
    </div>
  </div>
</template>
