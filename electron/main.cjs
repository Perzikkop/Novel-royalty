const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell } = require('electron');
const XLSX = require('xlsx');
const initSqlJs = require('sql.js');

const isDev = !app.isPackaged;
let db;
let SQL;
let mainWindow;
let tray = null;
const WEB_DAV_FILE_NAME = 'royalty-data.sqlite';
let webdavAutoSyncTimer = null;
let webdavDirty = false;
let isQuitting = false;

function getAssetPath(name) {
  return path.join(__dirname, 'assets', name);
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function getSqlJsLocateFile(file) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file);
  }
  return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
}

function getRendererUrl() {
  return isDev
    ? 'http://127.0.0.1:5173'
    : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
}

function getDatabasePath() {
  return path.join(app.getPath('userData'), WEB_DAV_FILE_NAME);
}

function getDefaultImportPath() {
  return String.raw`D:\Documents\我的文件\个人\其他资料\稿费\2025年.xlsx`;
}

function hasExistingData() {
  const counts = get(`
    SELECT
      (SELECT COUNT(*) FROM books) AS bookCount,
      (SELECT COUNT(*) FROM royalty_entries) AS entryCount,
      (SELECT COUNT(*) FROM monthly_financials) AS monthCount,
      (SELECT COUNT(*) FROM monthly_book_financials) AS monthBookCount
  `);
  return Number(counts?.bookCount || 0) > 0
    || Number(counts?.entryCount || 0) > 0
    || Number(counts?.monthCount || 0) > 0
    || Number(counts?.monthBookCount || 0) > 0;
}

function excelDateToIso(value) {
  if (!value) return '';
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return '';
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value);
}

function monthKeyToLabel(monthKey) {
  const [, month] = String(monthKey).split('-');
  return `${Number(month)}月`;
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function loadDatabaseFromDisk() {
  const dbPath = getDatabasePath();
  if (fs.existsSync(dbPath)) return new SQL.Database(fs.readFileSync(dbPath));
  return new SQL.Database();
}

function saveDatabase() {
  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function resetDatabaseFromBytes(bytes) {
  try { db?.close(); } catch {}
  db = new SQL.Database(bytes);
  setupSchema();
  saveDatabase();
}

function run(sql, params = []) { db.run(sql, params); }
function all(sql, params = []) {
  const stmt = db.prepare(sql, params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function get(sql, params = []) { return all(sql, params)[0] || null; }
function setMeta(key, value) {
  run('INSERT OR REPLACE INTO app_meta(meta_key, meta_value) VALUES (?, ?)', [key, String(value ?? '')]);
}
function getMeta(key, fallback = '') {
  return get('SELECT meta_value FROM app_meta WHERE meta_key = ?', [key])?.meta_value ?? fallback;
}

function setupSchema() {
  run(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );`);
  run(`CREATE TABLE IF NOT EXISTS royalty_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL,
    book_id INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    UNIQUE(entry_date, book_id, source),
    FOREIGN KEY (book_id) REFERENCES books(id)
  );`);
  run(`CREATE TABLE IF NOT EXISTS monthly_financials (
    month_key TEXT PRIMARY KEY,
    month_label TEXT NOT NULL,
    total_fee REAL NOT NULL DEFAULT 0,
    actual_total REAL NOT NULL DEFAULT 0,
    after_tax_total REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0
  );`);
  run(`CREATE TABLE IF NOT EXISTS monthly_book_financials (
    month_key TEXT NOT NULL,
    book_id INTEGER NOT NULL,
    actual_total REAL NOT NULL DEFAULT 0,
    after_tax_total REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (month_key, book_id),
    FOREIGN KEY (book_id) REFERENCES books(id)
  );`);
  run(`CREATE TABLE IF NOT EXISTS yearly_financials (
    year_key TEXT PRIMARY KEY,
    refund_amount REAL NOT NULL DEFAULT 0
  );`);
  run(`CREATE TABLE IF NOT EXISTS app_meta (
    meta_key TEXT PRIMARY KEY,
    meta_value TEXT NOT NULL
  );`);
}

function seedBooks(count) {
  for (let i = 1; i <= count; i += 1) run('INSERT OR IGNORE INTO books(name) VALUES (?)', [`书${i}`]);
}

function getOrderedBooks() {
  return all('SELECT id, name FROM books ORDER BY id');
}

function ensureBookSlots(count) {
  seedBooks(count);
  const books = getOrderedBooks();
  if (books.length >= count) return books.slice(0, count);
  return getOrderedBooks().slice(0, count);
}

function getBookColumns(headers) {
  const totalColumn = headers.findIndex((header) => String(header).trim() === '合计稿费');
  return headers.map((header, index) => ({ header, index })).filter((item) => /^书\d+稿费$/.test(String(item.header)) && (totalColumn === -1 || item.index < totalColumn));
}

function extractMonthlyBookSummaries(rows) {
  const summaryMap = new Map();
  rows.forEach((row) => {
    row.forEach((cell, index) => {
      const label = String(cell || '').trim();
      const match = label.match(/^书(\d+)(实际稿费|税后稿费)$/);
      if (!match) return;
      const bookNo = Number(match[1]);
      const fieldType = match[2];
      const numericValue = roundMoney(row[index + 1] || 0);
      if (!summaryMap.has(bookNo)) {
        summaryMap.set(bookNo, { bookNo, actualTotal: 0, afterTaxTotal: 0 });
      }
      const target = summaryMap.get(bookNo);
      if (fieldType === '实际稿费') target.actualTotal = numericValue;
      if (fieldType === '税后稿费') target.afterTaxTotal = numericValue;
    });
  });
  return Array.from(summaryMap.values()).sort((a, b) => a.bookNo - b.bookNo);
}

function normalizeBookIdReferences() {
  const books = getOrderedBooks();
  if (!books.length) return;
  const existingIds = new Set(books.map((book) => Number(book.id)));
  run('BEGIN TRANSACTION');
  try {
    books.forEach((book, index) => {
      const legacyId = index + 1;
      const actualId = Number(book.id);
      if (legacyId === actualId || existingIds.has(legacyId)) return;
      run('UPDATE royalty_entries SET book_id = ? WHERE book_id = ?', [actualId, legacyId]);
      run('UPDATE monthly_book_financials SET book_id = ? WHERE book_id = ?', [actualId, legacyId]);
    });
    run('COMMIT');
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
}

function cleanupDatabase() {
  run('BEGIN TRANSACTION');
  try {
    run('DELETE FROM royalty_entries WHERE entry_date IS NULL OR TRIM(entry_date) = ""');
    run('DELETE FROM royalty_entries WHERE book_id NOT IN (SELECT id FROM books)');
    run('DELETE FROM monthly_book_financials WHERE month_key IS NULL OR TRIM(month_key) = ""');
    run('DELETE FROM monthly_book_financials WHERE book_id NOT IN (SELECT id FROM books)');
    run('DELETE FROM monthly_financials WHERE month_key IS NULL OR TRIM(month_key) = ""');
    run('DELETE FROM yearly_financials WHERE year_key IS NULL OR TRIM(year_key) = ""');

    run('UPDATE royalty_entries SET amount = ROUND(COALESCE(amount, 0), 2)');
    run('UPDATE monthly_book_financials SET actual_total = ROUND(COALESCE(actual_total, 0), 2), after_tax_total = ROUND(COALESCE(after_tax_total, 0), 2), tax = ROUND(COALESCE(actual_total, 0) - COALESCE(after_tax_total, 0), 2)');
    run('UPDATE monthly_financials SET total_fee = ROUND(COALESCE(total_fee, 0), 2), actual_total = ROUND(COALESCE(actual_total, 0), 2), after_tax_total = ROUND(COALESCE(after_tax_total, 0), 2), tax = ROUND(COALESCE(actual_total, 0) - COALESCE(after_tax_total, 0), 2)');
    run('UPDATE yearly_financials SET refund_amount = ROUND(COALESCE(refund_amount, 0), 2)');

    run('DROP TABLE IF EXISTS monthly_summaries');
    run('COMMIT');
    saveDatabase();
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
}

function importWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath);
  const monthSheets = workbook.SheetNames.filter((name) => /^\d+月$/.test(name));
  let maxBookCount = 0;
  const importedMonths = [];

  monthSheets.forEach((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    maxBookCount = Math.max(maxBookCount, getBookColumns(rows[0] || []).length);
  });
  const orderedBooks = ensureBookSlots(maxBookCount || 5);

  run('BEGIN TRANSACTION');
  try {
    monthSheets.forEach((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
      const headers = rows[0] || [];
      const dateColumn = headers.findIndex((header) => String(header).trim() === '日期');
      const bookColumns = getBookColumns(headers);
      let monthKey = '';
      const dateRows = rows.slice(1).filter((row) => typeof row[dateColumn] === 'number');
      dateRows.forEach((row) => {
        const entryDate = excelDateToIso(row[dateColumn]);
        monthKey = entryDate.slice(0, 7);
      });
      if (monthKey) {
        run("DELETE FROM royalty_entries WHERE source = 'import' AND entry_date LIKE ?", [`${monthKey}%`]);
        run('DELETE FROM monthly_financials WHERE month_key = ?', [monthKey]);
        run('DELETE FROM monthly_book_financials WHERE month_key = ?', [monthKey]);
      }
      dateRows.forEach((row) => {
        const entryDate = excelDateToIso(row[dateColumn]);
        monthKey = entryDate.slice(0, 7);
        bookColumns.forEach((column, idx) => {
          const amount = Number(row[column.index] || 0);
          if (!Number.isFinite(amount) || amount === 0) return;
          const mappedBookId = orderedBooks[idx]?.id;
          if (!mappedBookId) return;
          run(`INSERT INTO royalty_entries(entry_date, book_id, amount, source)
               VALUES (?, ?, ?, 'import')
               ON CONFLICT(entry_date, book_id, source) DO UPDATE SET amount = excluded.amount`, [entryDate, mappedBookId, amount]);
        });
      });
      if (monthKey) {
        importedMonths.push({ monthKey, monthLabel: monthKeyToLabel(monthKey) });
        extractMonthlyBookSummaries(rows).forEach((bookSummary) => {
          const mappedBookId = orderedBooks[bookSummary.bookNo - 1]?.id;
          if (!mappedBookId) return;
          run(`INSERT INTO monthly_book_financials(month_key, book_id, actual_total, after_tax_total, tax)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(month_key, book_id) DO UPDATE SET
                 actual_total = excluded.actual_total,
                 after_tax_total = excluded.after_tax_total,
                 tax = excluded.tax`, [
            monthKey,
            mappedBookId,
            bookSummary.actualTotal,
            bookSummary.afterTaxTotal,
            roundMoney(bookSummary.actualTotal - bookSummary.afterTaxTotal),
          ]);
        });
      }
    });

    const summaryRows = workbook.Sheets['全年汇总'] ? XLSX.utils.sheet_to_json(workbook.Sheets['全年汇总'], { header: 1, defval: '' }).slice(1) : [];
    importedMonths.forEach((month, index) => {
      const summaryRow = summaryRows[index] || [];
      run(`INSERT INTO monthly_financials(month_key, month_label, total_fee, actual_total, after_tax_total, tax)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(month_key) DO UPDATE SET
             month_label = excluded.month_label,
             total_fee = excluded.total_fee,
             actual_total = excluded.actual_total,
             after_tax_total = excluded.after_tax_total,
             tax = excluded.tax`,
        [month.monthKey, month.monthLabel, roundMoney(summaryRow[1] || 0), roundMoney(summaryRow[2] || 0), roundMoney(summaryRow[3] || 0), roundMoney(summaryRow[4] || 0)]);
    });
    setMeta('last_import_path', filePath);
    setMeta('last_import_at', new Date().toISOString());
    run('COMMIT');
    saveDatabase();
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
}

function effectiveEntriesSql() {
  return `WITH effective_entries AS (
    SELECT entry_date, book_id,
      COALESCE(MAX(CASE WHEN source = 'manual' THEN amount END), MAX(CASE WHEN source = 'import' THEN amount END), 0) AS amount,
      CASE WHEN MAX(CASE WHEN source = 'manual' THEN 1 ELSE 0 END) = 1 THEN 'manual' ELSE 'import' END AS source
    FROM royalty_entries
    GROUP BY entry_date, book_id
  )`;
}

function getDailySummary(limit = 180) {
  return all(`${effectiveEntriesSql()}
    SELECT entry_date AS entryDate, ROUND(SUM(amount), 2) AS total, COUNT(*) AS bookCount
    FROM effective_entries GROUP BY entry_date ORDER BY entry_date DESC LIMIT ?`, [limit]);
}

function getMonthlySummary() {
  const books = all('SELECT id, name FROM books ORDER BY id');
  const dailyMonthRows = all(`${effectiveEntriesSql()}
    SELECT substr(entry_date, 1, 7) AS monthKey, ROUND(SUM(amount), 2) AS totalFee
    FROM effective_entries GROUP BY substr(entry_date, 1, 7)`);
  const dailyBookRows = all(`${effectiveEntriesSql()}
    SELECT substr(entry_date, 1, 7) AS monthKey, book_id AS bookId, ROUND(SUM(amount), 2) AS totalFee
    FROM effective_entries GROUP BY substr(entry_date, 1, 7), book_id`);
  const financialRows = all(`
    SELECT month_key AS monthKey, month_label AS monthLabel, total_fee AS storedTotalFee,
           actual_total AS actualTotal, after_tax_total AS afterTaxTotal, tax AS tax
    FROM monthly_financials
  `);
  const monthBookRows = all(`
    SELECT month_key AS monthKey, book_id AS bookId, actual_total AS actualTotal,
           after_tax_total AS afterTaxTotal, tax AS tax
    FROM monthly_book_financials
  `);

  const months = new Map();
  const ensureMonth = (monthKey) => {
    if (!monthKey) return null;
    if (!months.has(monthKey)) {
      months.set(monthKey, {
        monthKey,
        monthLabel: monthKeyToLabel(monthKey),
        totalFee: 0,
        actualTotal: 0,
        afterTaxTotal: 0,
        tax: 0,
        books: books.map((book) => ({
          bookId: book.id,
          bookName: book.name,
          totalFee: 0,
          actualTotal: 0,
          afterTaxTotal: 0,
          tax: 0,
        })),
      });
    }
    return months.get(monthKey);
  };

  dailyMonthRows.forEach((row) => {
    const month = ensureMonth(row.monthKey);
    month.totalFee = Number(row.totalFee || 0);
  });

  financialRows.forEach((row) => {
    const month = ensureMonth(row.monthKey);
    month.monthLabel = row.monthLabel || month.monthLabel;
    month.totalFee = month.totalFee || Number(row.storedTotalFee || 0);
    month.actualTotal = Number(row.actualTotal || 0);
    month.afterTaxTotal = Number(row.afterTaxTotal || 0);
    month.tax = Number(row.tax || Number((month.actualTotal - month.afterTaxTotal).toFixed(2)));
  });

  const bookIndex = new Map(books.map((book, index) => [book.id, index]));
  dailyBookRows.forEach((row) => {
    const month = ensureMonth(row.monthKey);
    const index = bookIndex.get(Number(row.bookId));
    if (index === undefined) return;
    month.books[index].totalFee = Number(row.totalFee || 0);
  });

  monthBookRows.forEach((row) => {
    const month = ensureMonth(row.monthKey);
    const index = bookIndex.get(Number(row.bookId));
    if (index === undefined) return;
    const target = month.books[index];
    target.actualTotal = Number(row.actualTotal || 0);
    target.afterTaxTotal = Number(row.afterTaxTotal || 0);
    target.tax = Number(row.tax || Number((target.actualTotal - target.afterTaxTotal).toFixed(2)));
  });

  return Array.from(months.values())
    .map((month) => {
      const hasMonthlyBooks = month.books.some((book) => book.actualTotal || book.afterTaxTotal || book.tax);
      const actualTotal = hasMonthlyBooks
        ? month.books.reduce((sum, book) => sum + Number(book.actualTotal || 0), 0)
        : Number(month.actualTotal || 0);
      const afterTaxTotal = hasMonthlyBooks
        ? month.books.reduce((sum, book) => sum + Number(book.afterTaxTotal || 0), 0)
        : Number(month.afterTaxTotal || 0);
      const tax = hasMonthlyBooks
        ? month.books.reduce((sum, book) => sum + Number(book.tax || 0), 0)
        : Number(month.tax || Number((actualTotal - afterTaxTotal).toFixed(2)));

      return {
        ...month,
        actualTotal: Number(actualTotal.toFixed(2)),
        afterTaxTotal: Number(afterTaxTotal.toFixed(2)),
        tax: Number(tax.toFixed(2)),
        books: month.books.map((book) => ({
          ...book,
          totalFee: Number(Number(book.totalFee || 0).toFixed(2)),
          actualTotal: Number(Number(book.actualTotal || 0).toFixed(2)),
          afterTaxTotal: Number(Number(book.afterTaxTotal || 0).toFixed(2)),
          tax: Number(Number(book.tax || 0).toFixed(2)),
        })),
      };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

function getYearlySummary() {
  const refundRows = all('SELECT year_key AS yearKey, refund_amount AS refundAmount FROM yearly_financials');
  const refundMap = new Map(refundRows.map((row) => [row.yearKey, Number(row.refundAmount || 0)]));
  const merged = new Map();
  getMonthlySummary().forEach((month) => {
    const yearKey = month.monthKey.slice(0, 4);
    if (!merged.has(yearKey)) {
      merged.set(yearKey, {
        yearKey,
        totalFee: 0,
        actualTotal: 0,
        afterTaxTotal: 0,
        tax: 0,
        books: month.books.map((book) => ({
          bookId: book.bookId,
          bookName: book.bookName,
          totalFee: 0,
          actualTotal: 0,
          afterTaxTotal: 0,
          tax: 0,
        })),
      });
    }
    const current = merged.get(yearKey);
    current.totalFee += Number(month.totalFee || 0);
    current.actualTotal += Number(month.actualTotal || 0);
    current.afterTaxTotal += Number(month.afterTaxTotal || 0);
    current.tax += Number(month.tax || 0);
    month.books.forEach((book, index) => {
      current.books[index].totalFee += Number(book.totalFee || 0);
      current.books[index].actualTotal += Number(book.actualTotal || 0);
      current.books[index].afterTaxTotal += Number(book.afterTaxTotal || 0);
      current.books[index].tax += Number(book.tax || 0);
    });
  });
  refundRows.forEach((row) => {
    if (!merged.has(row.yearKey)) {
      const books = all('SELECT id, name FROM books ORDER BY id').map((book) => ({
        bookId: book.id,
        bookName: book.name,
        totalFee: 0,
        actualTotal: 0,
        afterTaxTotal: 0,
        tax: 0,
      }));
      merged.set(row.yearKey, {
        yearKey: row.yearKey,
        totalFee: 0,
        actualTotal: 0,
        afterTaxTotal: 0,
        tax: 0,
        books,
      });
    }
  });
  return Array.from(merged.values())
    .map((item) => ({
      yearKey: item.yearKey,
      totalFee: Number(item.totalFee.toFixed(2)),
      actualTotal: Number(item.actualTotal.toFixed(2)),
      afterTaxTotal: Number(item.afterTaxTotal.toFixed(2)),
      tax: Number(item.tax.toFixed(2)),
      books: item.books.map((book) => ({
        ...book,
        totalFee: Number(book.totalFee.toFixed(2)),
        actualTotal: Number(book.actualTotal.toFixed(2)),
        afterTaxTotal: Number(book.afterTaxTotal.toFixed(2)),
        tax: Number(book.tax.toFixed(2)),
      })),
    }))
    .map((item) => {
      const refundAmount = Number(refundMap.get(item.yearKey) || 0);
      const actualIncome = Number((item.afterTaxTotal + refundAmount).toFixed(2));
      return {
        ...item,
        refundAmount,
        actualIncome,
      };
    })
    .sort((a, b) => b.yearKey.localeCompare(a.yearKey));
}

function getTodayBookSnapshot(entryDate) {
  return all(`${effectiveEntriesSql()}
    SELECT b.id, b.name, e.amount AS amount
    FROM books b LEFT JOIN effective_entries e ON e.book_id = b.id AND e.entry_date = ?
    ORDER BY b.id`, [entryDate]).map((row) => ({ id: row.id, name: row.name, amount: row.amount === null ? '' : String(row.amount || '') }));
}

function getWebDavConfig() {
  const directory = getMeta('webdav_directory', getMeta('webdav_url', ''));
  const normalizedDirectory = String(directory || '').trim().replace(/\/+$/, '');
  const autoSyncMinutes = Math.max(1, Number(getMeta('webdav_auto_sync_minutes', '10')) || 10);
  return {
    directory: normalizedDirectory,
    fileName: WEB_DAV_FILE_NAME,
    fileUrl: normalizedDirectory ? `${normalizedDirectory}/${WEB_DAV_FILE_NAME}` : '',
    username: getMeta('webdav_username', ''),
    password: getMeta('webdav_password', ''),
    enabled: getMeta('webdav_enabled', 'false') === 'true',
    autoSyncMinutes,
    lastSyncAt: getMeta('webdav_last_sync_at', ''),
    lastSyncStatus: getMeta('webdav_last_sync_status', ''),
    lastSyncMessage: getMeta('webdav_last_sync_message', ''),
  };
}

function getWebDavFileUrl() {
  const config = getWebDavConfig();
  if (!config.directory) throw new Error('请先填写 WebDAV 目录');
  return config.fileUrl;
}

async function webdavRequest(method, body) {
  const config = getWebDavConfig();
  const fileUrl = getWebDavFileUrl();
  const headers = { Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}` };
  if (body) headers['Content-Type'] = 'application/octet-stream';
  const response = await fetch(fileUrl, { method, headers, body });
  if (!response.ok) throw new Error(`WebDAV ${method} 失败：${response.status} ${response.statusText}`);
  return response;
}

async function pushDatabaseToWebDav() {
  saveDatabase();
  await webdavRequest('PUT', Buffer.from(db.export()));
  setMeta('webdav_last_sync_at', new Date().toISOString());
  setMeta('webdav_last_sync_status', 'success');
  setMeta('webdav_last_sync_message', '已上传到 WebDAV');
  webdavDirty = false;
  saveDatabase();
  return getWebDavConfig();
}

async function pullDatabaseFromWebDav() {
  const response = await webdavRequest('GET');
  resetDatabaseFromBytes(new Uint8Array(await response.arrayBuffer()));
  setMeta('webdav_last_sync_at', new Date().toISOString());
  setMeta('webdav_last_sync_status', 'success');
  setMeta('webdav_last_sync_message', '已从 WebDAV 下载并覆盖本地');
  saveDatabase();
  return getDashboardData();
}

async function safeAutoPush() {
  const config = getWebDavConfig();
  if (!config.enabled || !config.directory) return;
  webdavDirty = true;
}

async function flushAutoSyncIfNeeded() {
  const config = getWebDavConfig();
  if (!config.enabled || !config.directory || !webdavDirty) return;
  try {
    await pushDatabaseToWebDav();
  } catch (error) {
    setMeta('webdav_last_sync_at', new Date().toISOString());
    setMeta('webdav_last_sync_status', 'error');
    setMeta('webdav_last_sync_message', error.message || '同步失败');
    saveDatabase();
  }
}

function refreshWebDavAutoSyncTimer() {
  if (webdavAutoSyncTimer) {
    clearInterval(webdavAutoSyncTimer);
    webdavAutoSyncTimer = null;
  }
  const config = getWebDavConfig();
  if (!config.enabled || !config.directory) return;
  const intervalMs = Math.max(1, Number(config.autoSyncMinutes || 10)) * 60 * 1000;
  webdavAutoSyncTimer = setInterval(() => {
    flushAutoSyncIfNeeded().catch(() => {});
  }, intervalMs);
}

function getDashboardData() {
  const today = new Date().toISOString().slice(0, 10);
  const books = all('SELECT id, name FROM books ORDER BY id');
  const daySummary = getDailySummary();
  const monthSummary = getMonthlySummary();
  const yearSummary = getYearlySummary();
  const totals = get(`${effectiveEntriesSql()}
    SELECT ROUND(COALESCE(SUM(amount),0),2) AS totalRoyalty, COUNT(DISTINCT entry_date) AS activeDays, COUNT(*) AS entryCount FROM effective_entries`) || { totalRoyalty: 0, activeDays: 0, entryCount: 0 };
  return {
    books,
    totals,
    today,
    todayBooks: getTodayBookSnapshot(today),
    daySummary,
    monthSummary,
    yearSummary,
    meta: {
      dbPath: getDatabasePath(),
      lastImportPath: getMeta('last_import_path', ''),
      lastImportAt: getMeta('last_import_at', ''),
      defaultImportPath: getDefaultImportPath(),
      webdav: getWebDavConfig(),
    },
  };
}

function getDateEntries(entryDate) {
  const rows = all(`${effectiveEntriesSql()}
    SELECT book_id AS bookId, amount FROM effective_entries WHERE entry_date = ? ORDER BY book_id`, [entryDate]);
  const mapped = Object.fromEntries(rows.map((row) => [String(row.bookId), String(row.amount)]));
  return { entryDate, amounts: mapped };
}

function createBook(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('书名不能为空');
  run('INSERT INTO books(name) VALUES (?)', [trimmed]);
  saveDatabase();
  return getDashboardData();
}

function updateBook(payload) {
  const id = Number(payload?.id || 0);
  const name = String(payload?.name || '').trim();
  if (!id) throw new Error('缺少书籍 ID');
  if (!name) throw new Error('书名不能为空');
  run('UPDATE books SET name = ? WHERE id = ?', [name, id]);
  saveDatabase();
  return getDashboardData();
}

function deleteBook(id) {
  const numericId = Number(id || 0);
  if (!numericId) throw new Error('缺少书籍 ID');
  run('BEGIN TRANSACTION');
  try {
    run('DELETE FROM royalty_entries WHERE book_id = ?', [numericId]);
    run('DELETE FROM monthly_book_financials WHERE book_id = ?', [numericId]);
    run('DELETE FROM books WHERE id = ?', [numericId]);
    run('COMMIT');
    saveDatabase();
    return getDashboardData();
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
}

function saveMonthFinancials(payload) {
  const monthKey = String(payload?.monthKey || '');
  if (!monthKey) throw new Error('缺少月份');
  const books = Array.isArray(payload?.books) ? payload.books : [];
  const totalFee = Number(
    get('SELECT total_fee FROM monthly_financials WHERE month_key = ?', [monthKey])?.total_fee
      || getMonthlySummary().find((m) => m.monthKey === monthKey)?.totalFee
      || 0
  );

  run('BEGIN TRANSACTION');
  try {
    books.forEach((book) => {
      const bookId = Number(book?.bookId || 0);
      if (!bookId) return;
      const rawActual = book?.actualTotal ?? '';
      const rawAfterTax = book?.afterTaxTotal ?? '';
      if (rawActual === '' && rawAfterTax === '') {
        run('DELETE FROM monthly_book_financials WHERE month_key = ? AND book_id = ?', [monthKey, bookId]);
        return;
      }
      const actualTotal = Number(rawActual || 0);
      const afterTaxTotal = Number(rawAfterTax || 0);
      const tax = Number((actualTotal - afterTaxTotal).toFixed(2));
      run(`
        INSERT INTO monthly_book_financials(month_key, book_id, actual_total, after_tax_total, tax)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(month_key, book_id) DO UPDATE SET
          actual_total = excluded.actual_total,
          after_tax_total = excluded.after_tax_total,
          tax = excluded.tax
      `, [monthKey, bookId, actualTotal, afterTaxTotal, tax]);
    });

    const totals = get(`
      SELECT
        ROUND(COALESCE(SUM(actual_total), 0), 2) AS actualTotal,
        ROUND(COALESCE(SUM(after_tax_total), 0), 2) AS afterTaxTotal,
        ROUND(COALESCE(SUM(tax), 0), 2) AS tax
      FROM monthly_book_financials
      WHERE month_key = ?
    `, [monthKey]) || { actualTotal: 0, afterTaxTotal: 0, tax: 0 };

    run(`INSERT INTO monthly_financials(month_key, month_label, total_fee, actual_total, after_tax_total, tax)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(month_key) DO UPDATE SET
           month_label = excluded.month_label,
           total_fee = excluded.total_fee,
           actual_total = excluded.actual_total,
           after_tax_total = excluded.after_tax_total,
           tax = excluded.tax`,
      [monthKey, monthKeyToLabel(monthKey), totalFee, Number(totals.actualTotal || 0), Number(totals.afterTaxTotal || 0), Number(totals.tax || 0)]);
    run('COMMIT');
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
  saveDatabase();
  return getDashboardData();
}

function saveYearFinancials(payload) {
  const yearKey = String(payload?.yearKey || '').trim();
  if (!yearKey) throw new Error('缺少年份');
  const refundAmount = Number(payload?.refundAmount || 0);
  run(`
    INSERT INTO yearly_financials(year_key, refund_amount)
    VALUES (?, ?)
    ON CONFLICT(year_key) DO UPDATE SET refund_amount = excluded.refund_amount
  `, [yearKey, refundAmount]);
  saveDatabase();
  return getDashboardData();
}

function upsertRoyaltyEntry(payload) {
  const entryDate = String(payload?.entryDate || '');
  const amounts = payload?.amounts || {};
  const books = all('SELECT id FROM books ORDER BY id');
  run('BEGIN TRANSACTION');
  try {
    books.forEach((book) => {
      const rawAmount = amounts[String(book.id)] ?? amounts[book.id] ?? '';
      if (rawAmount === '') {
        run("DELETE FROM royalty_entries WHERE entry_date = ? AND book_id = ? AND source = 'manual'", [entryDate, book.id]);
      } else {
        const amount = Number(rawAmount || 0);
        run(`INSERT INTO royalty_entries(entry_date, book_id, amount, source)
             VALUES (?, ?, ?, 'manual')
             ON CONFLICT(entry_date, book_id, source) DO UPDATE SET amount = excluded.amount`,
          [entryDate, book.id, Number.isFinite(amount) ? amount : 0]);
      }
    });
    run('COMMIT');
    saveDatabase();
    return getDashboardData();
  } catch (error) {
    run('ROLLBACK');
    throw error;
  }
}

function saveWebDavConfig(payload) {
  const directory = String(payload?.directory ?? payload?.url ?? '').trim().replace(/\/+$/, '');
  const autoSyncMinutes = Math.max(1, Number(payload?.autoSyncMinutes || 10) || 10);
  setMeta('webdav_directory', directory);
  setMeta('webdav_url', directory);
  setMeta('webdav_username', String(payload?.username || '').trim());
  setMeta('webdav_password', String(payload?.password || ''));
  setMeta('webdav_enabled', payload?.enabled ? 'true' : 'false');
  setMeta('webdav_auto_sync_minutes', String(autoSyncMinutes));
  saveDatabase();
  refreshWebDavAutoSyncTimer();
  return getWebDavConfig();
}

async function testWebDavConfig(payload) {
  saveWebDavConfig(payload);
  await webdavRequest('GET');
  setMeta('webdav_last_sync_status', 'success');
  setMeta('webdav_last_sync_message', '连接成功');
  setMeta('webdav_last_sync_at', new Date().toISOString());
  saveDatabase();
  return getWebDavConfig();
}

async function exportDatabase() {
  saveDatabase();
  const result = await dialog.showSaveDialog({
    title: '导出数据库备份',
    defaultPath: path.join(app.getPath('documents'), `royalty-backup-${new Date().toISOString().slice(0,10)}.sqlite`),
    filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }],
  });
  if (result.canceled || !result.filePath) return '';
  fs.copyFileSync(getDatabasePath(), result.filePath);
  return result.filePath;
}

async function pickExcelFile() {
  const result = await dialog.showOpenDialog({
    title: '选择稿费 Excel',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    defaultPath: getMeta('last_import_path', getDefaultImportPath()),
  });
  if (result.canceled || !result.filePaths.length) return '';
  return result.filePaths[0];
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 1120,
    minHeight: 820,
    frame: false,
    titleBarStyle: 'hidden',
    title: '小说稿费记录器',
    backgroundColor: '#eef4ff',
    icon: getAssetPath('app-icon.png'),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  await mainWindow.loadURL(getRendererUrl());
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function ensureTray() {
  if (tray) return tray;
  tray = new Tray(getAssetPath('app-icon.png'));
  tray.setToolTip('小说稿费记录器');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主窗口', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        tray?.destroy();
        tray = null;
        mainWindow?.destroy();
        app.quit();
      },
    },
  ]));
  tray.on('double-click', () => showMainWindow());
  tray.on('click', () => showMainWindow());
  return tray;
}

async function initialize() {
  SQL = await initSqlJs({ locateFile: getSqlJsLocateFile });
  db = loadDatabaseFromDisk();
  setupSchema();
  normalizeBookIdReferences();
  cleanupDatabase();
  ensureTray();
  refreshWebDavAutoSyncTimer();
  const defaultImportPath = getDefaultImportPath();
  if (fs.existsSync(defaultImportPath) && !getMeta('last_import_at', '')) importWorkbook(defaultImportPath);
}

app.whenReady().then(async () => {
  await initialize();
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    } else {
      showMainWindow();
    }
  });
});
app.on('before-quit', () => {
  isQuitting = true;
});
app.on('window-all-closed', (event) => {
  if (!isQuitting) {
    event.preventDefault();
  } else if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('dashboard:load', async () => getDashboardData());
ipcMain.handle('entry:get-date', async (_event, entryDate) => getDateEntries(entryDate));
ipcMain.handle('entry:save', async (_event, payload) => { const data = upsertRoyaltyEntry(payload); await safeAutoPush(); return getDashboardData(); });
ipcMain.handle('book:create', async (_event, name) => { const data = createBook(name); await safeAutoPush(); return data; });
ipcMain.handle('book:update', async (_event, payload) => { const data = updateBook(payload); await safeAutoPush(); return data; });
ipcMain.handle('book:delete', async (_event, id) => { const data = deleteBook(id); await safeAutoPush(); return data; });
ipcMain.handle('month:save', async (_event, payload) => { const data = saveMonthFinancials(payload); await safeAutoPush(); return data; });
ipcMain.handle('year:save', async (_event, payload) => { const data = saveYearFinancials(payload); await safeAutoPush(); return data; });
ipcMain.handle('excel:pick', async () => pickExcelFile());
ipcMain.handle('excel:import', async (_event, selectedPath) => {
  let filePath = selectedPath;
  if (!filePath) {
    filePath = await pickExcelFile();
    if (!filePath) return { cancelled: true, data: getDashboardData() };
  }
  if (hasExistingData()) {
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['继续导入', '取消'],
      defaultId: 0,
      cancelId: 1,
      title: '确认导入',
      message: '当前已有数据，是否继续导入？',
      detail: '继续后会按日期、书籍和月份增量合并；重复的 Excel 数据会更新，不重复的数据会追加，手动录入的数据仍会保留并优先生效。',
    });
    if (confirm.response !== 0) {
      return { cancelled: true, data: getDashboardData() };
    }
  }
  importWorkbook(filePath);
  await safeAutoPush();
  return { cancelled: false, data: getDashboardData() };
});
ipcMain.handle('database:export', async () => exportDatabase());
ipcMain.handle('webdav:save-config', async (_event, payload) => saveWebDavConfig(payload));
ipcMain.handle('webdav:test', async (_event, payload) => testWebDavConfig(payload));
ipcMain.handle('webdav:push', async () => pushDatabaseToWebDav());
ipcMain.handle('webdav:pull', async () => pullDatabaseFromWebDav());
ipcMain.handle('path:open-db-folder', async () => { const folder = path.dirname(getDatabasePath()); await fs.promises.mkdir(folder, { recursive: true }); await shell.openPath(folder); return folder; });
ipcMain.handle('window:minimize', async () => { mainWindow?.minimize(); });
ipcMain.handle('window:close', async () => { mainWindow?.hide(); });
