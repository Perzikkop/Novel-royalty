<script setup>
import { computed, nextTick, onMounted, reactive, ref, toRaw, watch } from 'vue';
import dayjs from 'dayjs';
import appIconUrl from './assets/app-icon.png';
import EntryView from './components/EntryView.vue';
import QueryView from './components/QueryView.vue';
import SettingsView from './components/SettingsView.vue';

const DEFAULT_ENTRY_DATE = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
const mainTab = ref('entry');
const entryTab = ref('day');
const queryTab = ref('day');
const entryYear = ref(dayjs().format('YYYY'));
const entryMonthKey = ref(dayjs().format('YYYY-MM'));
const pageShellRef = ref(null);
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
  pageShellRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
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

    <div ref="pageShellRef" class="page-shell">
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
          <EntryView
            v-if="mainTab === 'entry'"
            v-model:entry-tab="entryTab"
            v-model:entry-year="entryYear"
            v-model:entry-month-key="entryMonthKey"
            v-model:active-book-id="activeBookId"
            :state="state"
            :form="form"
            :active-book="activeBook"
            :entry-total="entryTotal"
            :busy="busy"
            :month-years="monthYears"
            :visible-entry-months="visibleEntryMonths"
            :current-entry-month="currentEntryMonth"
            :current-month-totals="currentMonthTotals"
            :current-month-books="currentMonthBooks"
            :selected-entry-year-months="selectedEntryYearMonths"
            :yearly-drafts="yearlyDrafts"
            :monthly-drafts="monthlyDrafts"
            :recent-day-rows="recentDayRows"
            :default-entry-date="DEFAULT_ENTRY_DATE"
            :format-currency="formatCurrency"
            :jump-date="jumpDate"
            :save-entry="saveEntry"
            :save-month="saveMonth"
            :save-year="saveYear"
          />

          <QueryView
            v-else-if="mainTab === 'query'"
            v-model:query-tab="queryTab"
            :query-filters="queryFilters"
            :day-month-options="dayMonthOptions"
            :month-options="monthOptions"
            :year-options="yearOptions"
            :filtered-day-rows="filteredDayRows"
            :filtered-month-rows="filteredMonthRows"
            :filtered-year-rows="filteredYearRows"
            :day-total="dayTotal"
            :month-range-totals="monthRangeTotals"
            :year-range-totals="yearRangeTotals"
            :format-currency="formatCurrency"
            :edit-day="editDay"
          />

          <SettingsView
            v-else
            v-model:import-path="importPath"
            v-model:new-book-name="newBookName"
            :state="state"
            :webdav-form="webdavForm"
            :book-drafts="bookDrafts"
            :busy="busy"
            :format-beijing-time="formatBeijingTime"
            :add-book="addBook"
            :rename-book="renameBook"
            :remove-book="removeBook"
            :pick-excel-file="pickExcelFile"
            :import-excel="importExcel"
            :export-database="exportDatabase"
            :open-db-folder="openDbFolder"
            :save-web-dav-config="saveWebDavConfig"
            :test-web-dav="testWebDav"
            :push-web-dav="pushWebDav"
            :pull-web-dav="pullWebDav"
          />
        </template>
      </div>
    </div>
  </div>
</template>
