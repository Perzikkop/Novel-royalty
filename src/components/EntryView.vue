<template>
  <section class="entry-layout compact-layout">
    <div class="entry-main-stack">
      <nav class="sub-tabs">
        <button :class="['sub-tab', { active: entryTab === 'day' }]" @click="$emit('update:entryTab', 'day')">每日稿费录入</button>
        <button :class="['sub-tab', { active: entryTab === 'month' }]" @click="$emit('update:entryTab', 'month')">每月稿费录入</button>
      </nav>

      <article v-if="entryTab === 'day'" class="panel entry-panel">
        <div class="entry-header">
          <div class="entry-date-block">
            <button class="ghost small" @click="jumpDate(-1)">前一天</button>
            <input v-model="form.entryDate" type="date" />
            <button class="ghost small" @click="form.entryDate = defaultEntryDate">昨天</button>
            <button class="ghost small" @click="jumpDate(1)">后一天</button>
          </div>
          <div class="entry-total-card">{{ formatCurrency(entryTotal) }}</div>
        </div>

        <div class="book-tabs">
          <button
            v-for="book in state.books"
            :key="book.id"
            :class="['book-tab', { active: activeBookId === book.id }]"
            @click="$emit('update:activeBookId', book.id)"
          >
            {{ book.name }}
          </button>
        </div>

        <div v-if="activeBook" class="focus-row">
          <div class="focus-book">{{ activeBook.name }}</div>
          <input :value="form.amounts[activeBookId] ?? ''" class="focus-money" type="number" min="0" step="0.01" placeholder="0.00" @input="updateActiveAmount($event.target.value)" />
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
              @click="$emit('update:entryYear', year)"
            >
              {{ year }}
            </button>
          </div>
          <div class="month-chip-row">
            <button
              v-for="month in visibleEntryMonths"
              :key="month.monthKey"
              :class="['month-chip', { active: entryMonthKey === month.monthKey }]"
              @click="$emit('update:entryMonthKey', month.monthKey)"
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
</template>

<script setup>
defineEmits(['update:entryTab', 'update:entryYear', 'update:entryMonthKey', 'update:activeBookId']);
const props = defineProps({
  entryTab: { type: String, required: true },
  state: { type: Object, required: true },
  form: { type: Object, required: true },
  activeBookId: { type: Number, default: null },
  activeBook: { type: Object, default: null },
  entryTotal: { type: Number, required: true },
  busy: { type: Boolean, required: true },
  monthYears: { type: Array, required: true },
  entryYear: { type: String, required: true },
  visibleEntryMonths: { type: Array, required: true },
  entryMonthKey: { type: String, required: true },
  currentEntryMonth: { type: Object, default: null },
  currentMonthTotals: { type: Object, required: true },
  currentMonthBooks: { type: Array, required: true },
  selectedEntryYearMonths: { type: Array, required: true },
  yearlyDrafts: { type: Object, required: true },
  monthlyDrafts: { type: Object, required: true },
  recentDayRows: { type: Array, required: true },
  defaultEntryDate: { type: String, required: true },
  formatCurrency: { type: Function, required: true },
  jumpDate: { type: Function, required: true },
  saveEntry: { type: Function, required: true },
  saveMonth: { type: Function, required: true },
  saveYear: { type: Function, required: true }
});

function updateActiveAmount(value) {
  if (!props.activeBookId) return;
  props.form.amounts[props.activeBookId] = value;
}
</script>
