<template>
  <section class="settings-layout-shell">
    <article class="panel table-panel settings-table-panel">
      <div class="query-toolbar settings-toolbar">
        <div>
          <h2>设置</h2>
        </div>
      </div>
      <div class="table-scroll settings-scroll">
        <div class="settings-stack">
        <article class="group-card settings-card">
          <h2>书籍管理</h2>
          <div class="inline-form top-gap inline-form-compact">
            <input :value="newBookName" type="text" placeholder="新增书籍名称" @input="$emit('update:newBookName', $event.target.value)" @keydown.enter="addBook" />
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

        <article class="group-card settings-card">
          <h2>数据</h2>
          <label class="field top-gap">
            <span>Excel 路径</span>
            <input :value="importPath" type="text" @input="$emit('update:importPath', $event.target.value)" />
          </label>
          <div class="button-row wrap-row top-gap">
            <button class="ghost" :disabled="busy" @click="pickExcelFile">选择文件</button>
            <button class="primary" :disabled="busy" @click="importExcel">导入 Excel</button>
            <button class="ghost" :disabled="busy" @click="exportDatabase">导出备份</button>
            <button class="ghost" @click="openDbFolder">打开目录</button>
          </div>
        </article>

        <article class="group-card settings-card wide-settings">
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
        </div>
      </div>
    </article>
  </section>
</template>

<script setup>
defineEmits(['update:importPath', 'update:newBookName']);
defineProps({
  state: { type: Object, required: true },
  webdavForm: { type: Object, required: true },
  importPath: { type: String, required: true },
  newBookName: { type: String, required: true },
  bookDrafts: { type: Object, required: true },
  busy: { type: Boolean, required: true },
  formatBeijingTime: { type: Function, required: true },
  addBook: { type: Function, required: true },
  renameBook: { type: Function, required: true },
  removeBook: { type: Function, required: true },
  pickExcelFile: { type: Function, required: true },
  importExcel: { type: Function, required: true },
  exportDatabase: { type: Function, required: true },
  openDbFolder: { type: Function, required: true },
  saveWebDavConfig: { type: Function, required: true },
  testWebDav: { type: Function, required: true },
  pushWebDav: { type: Function, required: true },
  pullWebDav: { type: Function, required: true }
});
</script>
