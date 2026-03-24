<template>
  <section class="query-layout">
    <nav class="sub-tabs">
      <button :class="['sub-tab', { active: queryTab === 'day' }]" @click="$emit('update:queryTab', 'day')">按天</button>
      <button :class="['sub-tab', { active: queryTab === 'month' }]" @click="$emit('update:queryTab', 'month')">按月</button>
      <button :class="['sub-tab', { active: queryTab === 'year' }]" @click="$emit('update:queryTab', 'year')">按年</button>
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
</template>

<script setup>
defineEmits(['update:queryTab']);
defineProps({
  queryTab: { type: String, required: true },
  queryFilters: { type: Object, required: true },
  dayMonthOptions: { type: Array, required: true },
  monthOptions: { type: Array, required: true },
  yearOptions: { type: Array, required: true },
  filteredDayRows: { type: Array, required: true },
  filteredMonthRows: { type: Array, required: true },
  filteredYearRows: { type: Array, required: true },
  dayTotal: { type: Number, required: true },
  monthRangeTotals: { type: Object, required: true },
  yearRangeTotals: { type: Object, required: true },
  formatCurrency: { type: Function, required: true },
  editDay: { type: Function, required: true }
});
</script>
