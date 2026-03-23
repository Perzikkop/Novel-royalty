const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('royaltyApi', {
  loadDashboard: () => ipcRenderer.invoke('dashboard:load'),
  loadDateEntries: (entryDate) => ipcRenderer.invoke('entry:get-date', entryDate),
  saveEntry: (payload) => ipcRenderer.invoke('entry:save', payload),
  createBook: (name) => ipcRenderer.invoke('book:create', name),
  updateBook: (payload) => ipcRenderer.invoke('book:update', payload),
  deleteBook: (id) => ipcRenderer.invoke('book:delete', id),
  saveMonthFinancials: (payload) => ipcRenderer.invoke('month:save', payload),
  saveYearFinancials: (payload) => ipcRenderer.invoke('year:save', payload),
  pickExcelFile: () => ipcRenderer.invoke('excel:pick'),
  importExcel: (filePath) => ipcRenderer.invoke('excel:import', filePath),
  exportDatabase: () => ipcRenderer.invoke('database:export'),
  saveWebDavConfig: (payload) => ipcRenderer.invoke('webdav:save-config', payload),
  testWebDav: (payload) => ipcRenderer.invoke('webdav:test', payload),
  pushWebDav: () => ipcRenderer.invoke('webdav:push'),
  pullWebDav: () => ipcRenderer.invoke('webdav:pull'),
  openDbFolder: () => ipcRenderer.invoke('path:open-db-folder'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
});
