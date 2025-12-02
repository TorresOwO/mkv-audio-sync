// i18n - Internationalization
const translations = {
    en: {
        configuration: 'Configuration',
        singleFile: 'Single File',
        batchSeries: 'Batch (Series)',
        sourceMkv: 'Source MKV (Audio Provider)',
        targetMkv: 'Target MKV (Video Provider)',
        audioTrack: 'Audio Track',
        selectFile: 'Select a file...',
        selectTrack: 'Select a track...',
        browse: 'Browse',
        sourceFolder: 'Source Folder (Audio Provider)',
        targetFolder: 'Target Folder (Video Provider)',
        selectSourceFolder: 'Select source folder...',
        selectTargetFolder: 'Select target folder...',
        startSync: 'Start Synchronization',
        cancelOp: 'Cancel Operation',
        cancelling: 'Cancelling...',
        openOutputFolder: 'Open Output Folder',
        language: 'Language',
        noAudioTracks: 'No audio tracks found in source file.',
        successOutput: 'Success! Output',
        batchComplete: 'Batch processing completed successfully.',
        errorLoadingFiles: 'Error loading files',
        errorBrowsingFile: 'Error browsing file',
        errorBrowsingFolder: 'Error browsing folder',
        errorMediaInfo: 'Error getting media info',
        errorCancelling: 'Error cancelling',
        operationFailed: 'Operation failed'
    },
    es: {
        configuration: 'Configuración',
        singleFile: 'Archivo Individual',
        batchSeries: 'Lote (Series)',
        sourceMkv: 'MKV Fuente (Proveedor de Audio)',
        targetMkv: 'MKV Destino (Proveedor de Video)',
        audioTrack: 'Pista de Audio',
        selectFile: 'Seleccionar archivo...',
        selectTrack: 'Seleccionar pista...',
        browse: 'Examinar',
        sourceFolder: 'Carpeta Fuente (Proveedor de Audio)',
        targetFolder: 'Carpeta Destino (Proveedor de Video)',
        selectSourceFolder: 'Seleccionar carpeta fuente...',
        selectTargetFolder: 'Seleccionar carpeta destino...',
        startSync: 'Iniciar Sincronización',
        cancelOp: 'Cancelar Operación',
        cancelling: 'Cancelando...',
        openOutputFolder: 'Abrir Carpeta de Salida',
        language: 'Idioma',
        noAudioTracks: 'No se encontraron pistas de audio en el archivo fuente.',
        successOutput: '¡Éxito! Salida',
        batchComplete: 'Procesamiento por lotes completado exitosamente.',
        errorLoadingFiles: 'Error al cargar archivos',
        errorBrowsingFile: 'Error al examinar archivo',
        errorBrowsingFolder: 'Error al examinar carpeta',
        errorMediaInfo: 'Error al obtener información del medio',
        errorCancelling: 'Error al cancelar',
        operationFailed: 'Operación fallida'
    }
};

let currentLang = localStorage.getItem('lang') || 'es';

function t(key) {
    return translations[currentLang][key] || key;
}

function updateUI() {
    document.querySelector('.card h2').textContent = t('configuration');
    modeSingleBtn.textContent = t('singleFile');
    modeBatchBtn.textContent = t('batchSeries');
    document.querySelector('label[for="source-select"]').textContent = t('sourceMkv');
    document.querySelector('label[for="target-select"]').textContent = t('targetMkv');
    document.querySelector('label[for="track-select"]').textContent = t('audioTrack');
    document.querySelector('label[for="batch-source-folder"]').textContent = t('sourceFolder');
    document.querySelector('label[for="batch-target-folder"]').textContent = t('targetFolder');
    batchSourceFolder.placeholder = t('selectSourceFolder');
    batchTargetFolder.placeholder = t('selectTargetFolder');

    // Update all browse buttons
    document.querySelectorAll('#source-browse, #target-browse, #batch-source-browse, #batch-target-browse').forEach(btn => {
        btn.textContent = t('browse');
    });

    syncBtn.textContent = t('startSync');
    if (!cancelBtn.disabled) cancelBtn.textContent = t('cancelOp');
    openFolderBtn.textContent = t('openOutputFolder');
    document.getElementById('lang-label').textContent = t('language');
}

const syncBtn = document.getElementById('sync-btn');
const cancelBtn = document.getElementById('cancel-btn');
const openFolderBtn = document.getElementById('open-folder-btn');
const logArea = document.getElementById('log-area');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressContainer = document.getElementById('progress-container');

// Mode Switching Elements
const modeSingleBtn = document.getElementById('mode-single');
const modeBatchBtn = document.getElementById('mode-batch');
const singleModeContainer = document.getElementById('single-mode-container');
const batchModeContainer = document.getElementById('batch-mode-container');

let currentMode = 'single'; // 'single' or 'batch'

// Single Mode Elements
const sourceSelect = document.getElementById('source-select');
const sourceBrowse = document.getElementById('source-browse');
const trackSelect = document.getElementById('track-select');
const trackGroup = document.getElementById('track-group');
const targetSelect = document.getElementById('target-select');
const targetBrowse = document.getElementById('target-browse');

// Batch Mode Elements
const batchSourceFolder = document.getElementById('batch-source-folder');
const batchSourceBrowse = document.getElementById('batch-source-browse');
const batchTargetFolder = document.getElementById('batch-target-folder');
const batchTargetBrowse = document.getElementById('batch-target-browse');

// Logging
function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.classList.add('log-entry', `log-${type}`);
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight; // Auto-scroll
}

window.api.onLog(({ message, type }) => {
    log(message, type);
});

// Progress
function updateProgress(percent, text) {
    if (percent === -1) {
        progressBar.classList.add('progress-indeterminate');
        progressBar.style.width = '100%';
    } else {
        progressBar.classList.remove('progress-indeterminate');
        progressBar.style.width = `${percent}%`;
    }

    if (text) {
        progressText.textContent = text;
    } else if (percent === 100) {
        progressText.textContent = 'Completed';
    } else if (percent === 0) {
        progressText.textContent = 'Ready';
    }
}

window.api.onProgress(({ percent, text }) => {
    updateProgress(percent, text);
});

// Mode Switching Logic
modeSingleBtn.addEventListener('click', () => {
    currentMode = 'single';
    modeSingleBtn.classList.add('active');
    modeBatchBtn.classList.remove('active');
    singleModeContainer.classList.remove('hidden');
    batchModeContainer.classList.add('hidden');
    checkReady();
});

modeBatchBtn.addEventListener('click', () => {
    currentMode = 'batch';
    modeBatchBtn.classList.add('active');
    modeSingleBtn.classList.remove('active');
    batchModeContainer.classList.remove('hidden');
    singleModeContainer.classList.add('hidden');
    checkReady();
});

// Load Files (Single Mode)
async function loadFiles() {
    try {
        const files = await window.api.getFiles();
        const mkvFiles = files.filter(f => f.toLowerCase().endsWith('.mkv'));

        sourceSelect.innerHTML = '<option value="" disabled selected>Select a file...</option>';
        targetSelect.innerHTML = '<option value="" disabled selected>Select a file...</option>';

        mkvFiles.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            sourceSelect.appendChild(option.cloneNode(true));
            targetSelect.appendChild(option);
        });
    } catch (e) {
        log(`Error loading files: ${e.message}`, 'error');
    }
}

// Browse Handlers
async function handleBrowse(selectElement) {
    try {
        const file = await window.api.openFileDialog();
        if (file) {
            // Add to select if not exists
            let exists = false;
            for (let i = 0; i < selectElement.options.length; i++) {
                if (selectElement.options[i].value === file) {
                    selectElement.selectedIndex = i;
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const option = document.createElement('option');
                option.value = file;
                option.textContent = file;
                selectElement.appendChild(option);
                selectElement.value = file;
            }
            selectElement.dispatchEvent(new Event('change'));
        }
    } catch (e) {
        log(`Error browsing file: ${e.message}`, 'error');
    }
}

async function handleFolderBrowse(inputElement) {
    try {
        const folder = await window.api.openFolderDialog();
        if (folder) {
            inputElement.value = folder;
            checkReady();
        }
    } catch (e) {
        log(`Error browsing folder: ${e.message}`, 'error');
    }
}

sourceBrowse.addEventListener('click', () => handleBrowse(sourceSelect));
targetBrowse.addEventListener('click', () => handleBrowse(targetSelect));

batchSourceBrowse.addEventListener('click', () => handleFolderBrowse(batchSourceFolder));
batchTargetBrowse.addEventListener('click', () => handleFolderBrowse(batchTargetFolder));

// Track Selection
sourceSelect.addEventListener('change', async () => {
    const file = sourceSelect.value;
    if (!file) return;

    try {
        const info = await window.api.getMediaInfo(file);
        trackSelect.innerHTML = '<option value="" disabled selected>Select a track...</option>';

        if (info.audioTracks.length === 0) {
            log('No audio tracks found in source file.', 'warning');
            trackGroup.classList.add('hidden');
        } else {
            info.audioTracks.forEach(track => {
                const option = document.createElement('option');
                option.value = track.index;
                option.textContent = `${track.index}: ${track.lang} - ${track.details}`;
                trackSelect.appendChild(option);
            });
            trackGroup.classList.remove('hidden');
        }
        checkReady();
    } catch (e) {
        log(`Error getting media info: ${e.message}`, 'error');
    }
});

targetSelect.addEventListener('change', checkReady);
trackSelect.addEventListener('change', checkReady);

function checkReady() {
    let ready = false;
    if (currentMode === 'single') {
        ready = sourceSelect.value && targetSelect.value && trackSelect.value;
    } else {
        ready = batchSourceFolder.value && batchTargetFolder.value;
    }
    syncBtn.disabled = !ready;
}

// Sync Action
syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    cancelBtn.classList.remove('hidden');
    openFolderBtn.classList.add('hidden');
    progressContainer.style.display = 'block';
    updateProgress(0, 'Starting...');

    try {
        if (currentMode === 'single') {
            const result = await window.api.startSync({
                sourceFile: sourceSelect.value,
                targetFile: targetSelect.value,
                trackIndex: trackSelect.value
            });
            if (result.success) {
                log(`Success! Output: ${result.outputPath}`, 'success');
                openFolderBtn.classList.remove('hidden');
            }
        } else {
            const result = await window.api.startBatchSync({
                sourceFolder: batchSourceFolder.value,
                targetFolder: batchTargetFolder.value
            });
            if (result.success) {
                log('Batch processing completed successfully.', 'success');
                openFolderBtn.classList.remove('hidden');
            }
        }
    } catch (e) {
        if (!e.message.includes('cancelled')) {
            log(`Operation failed: ${e.message}`, 'error');
        }
    } finally {
        syncBtn.disabled = false;
        cancelBtn.classList.add('hidden');
        checkReady(); // Re-enable if inputs still valid
    }
});

cancelBtn.addEventListener('click', async () => {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Cancelling...';
    try {
        await window.api.cancelSync();
    } catch (e) {
        log(`Error cancelling: ${e.message}`, 'error');
    } finally {
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancel Operation';
    }
});

openFolderBtn.addEventListener('click', async () => {
    await window.api.openOutputFolder();
});


// Language Selector
const langSelect = document.getElementById('lang-select');
langSelect.value = currentLang;
langSelect.addEventListener('change', () => {
    currentLang = langSelect.value;
    localStorage.setItem('lang', currentLang);
    updateUI();
});

// Initial Load
updateUI();
loadFiles();
