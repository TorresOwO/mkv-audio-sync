const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getFiles: () => ipcRenderer.invoke('get-files'),
    getMediaInfo: (filePath) => ipcRenderer.invoke('get-media-info', filePath),
    startSync: (data) => ipcRenderer.invoke('start-sync', data),
    startBatchSync: (data) => ipcRenderer.invoke('start-batch-sync', data),
    cancelSync: () => ipcRenderer.invoke('cancel-sync'),
    onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data)),
    onProgress: (callback) => ipcRenderer.on('progress', (event, percent) => callback(percent)),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
    openOutputFolder: () => ipcRenderer.invoke('open-output-folder')
});
