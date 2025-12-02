// i18n - Internationalization
const translations = {
    en: {
        // Header
        configuration: 'Configuration',
        singleFile: 'Single File',
        batchSeries: 'Batch (Series)',

        // Single Mode
        sourceMkv: 'Source MKV (Audio Provider)',
        targetMkv: 'Target MKV (Video Provider)',
        audioTrack: 'Audio Track',
        selectFile: 'Select a file...',
        selectTrack: 'Select a track...',
        browse: 'Browse',

        // Batch Mode
        sourceFolder: 'Source Folder (Audio Provider)',
        targetFolder: 'Target Folder (Video Provider)',
        selectSourceFolder: 'Select source folder...',
        selectTargetFolder: 'Select target folder...',

        // Buttons
        startSync: 'Start Synchronization',
        cancelOp: 'Cancel Operation',
        cancelling: 'Cancelling...',
        openOutputFolder: 'Open Output Folder',

        // Progress
        ready: 'Ready',
        starting: 'Starting...',
        initializing: 'Initializing...',
        converting: 'Converting',
        extracting: 'Extracting Audio...',
        cleaning: 'Cleaning Audio...',
        synchronizing: 'Synchronizing...',
        encoding: 'Encoding Final Audio...',
        merging: 'Merging...',
        completed: 'Completed',
        cancelled: 'Cancelled',

        // Log Messages
        noAudioTracks: 'No audio tracks found in source file.',
        errorLoadingFiles: 'Error loading files',
        errorBrowsingFile: 'Error browsing file',
        errorBrowsingFolder: 'Error browsing folder',
        errorMediaInfo: 'Error getting media info',
        errorCancelling: 'Error cancelling',
        operationFailed: 'Operation failed',
        successOutput: 'Success! Output',
        batchComplete: 'Batch processing completed successfully.',

        // Settings
        language: 'Language'
    },
    es: {
        // Header
        configuration: 'Configuración',
        singleFile: 'Archivo Individual',
        batchSeries: 'Lote (Series)',

        // Single Mode
        sourceMkv: 'MKV Fuente (Proveedor de Audio)',
        targetMkv: 'MKV Destino (Proveedor de Video)',
        audioTrack: 'Pista de Audio',
        selectFile: 'Seleccionar archivo...',
        selectTrack: 'Seleccionar pista...',
        browse: 'Examinar',

        // Batch Mode
        sourceFolder: 'Carpeta Fuente (Proveedor de Audio)',
        targetFolder: 'Carpeta Destino (Proveedor de Video)',
        selectSourceFolder: 'Seleccionar carpeta fuente...',
        selectTargetFolder: 'Seleccionar carpeta destino...',

        // Buttons
        startSync: 'Iniciar Sincronización',
        cancelOp: 'Cancelar Operación',
        cancelling: 'Cancelando...',
        openOutputFolder: 'Abrir Carpeta de Salida',

        // Progress
        ready: 'Listo',
        starting: 'Iniciando...',
        initializing: 'Inicializando...',
        converting: 'Convirtiendo',
        extracting: 'Extrayendo Audio...',
        cleaning: 'Limpiando Audio...',
        synchronizing: 'Sincronizando...',
        encoding: 'Codificando Audio Final...',
        merging: 'Mezclando...',
        completed: 'Completado',
        cancelled: 'Cancelado',

        // Log Messages
        noAudioTracks: 'No se encontraron pistas de audio en el archivo fuente.',
        errorLoadingFiles: 'Error al cargar archivos',
        errorBrowsingFile: 'Error al examinar archivo',
        errorBrowsingFolder: 'Error al examinar carpeta',
        errorMediaInfo: 'Error al obtener información del medio',
        errorCancelling: 'Error al cancelar',
        operationFailed: 'Operación fallida',
        successOutput: '¡Éxito! Salida',
        batchComplete: 'Procesamiento por lotes completado exitosamente.',

        // Settings
        language: 'Idioma'
    }
};

// Get current language from localStorage or default to Spanish
let currentLang = localStorage.getItem('lang') || 'es';

function t(key) {
    return translations[currentLang][key] || key;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    updateUI();
}

function updateUI() {
    // Header
    document.querySelector('.card h2').textContent = t('configuration');
    modeSingleBtn.textContent = t('singleFile');
    modeBatchBtn.textContent = t('batchSeries');

    // Single Mode
    document.querySelector('label[for="source-select"]').textContent = t('sourceMkv');
    document.querySelector('label[for="target-select"]').textContent = t('targetMkv');
    document.querySelector('label[for="track-select"]').textContent = t('audioTrack');
    sourceBrowse.textContent = t('browse');
    targetBrowse.textContent = t('browse');

    // Update select placeholders
    if (sourceSelect.options[0]) sourceSelect.options[0].textContent = t('selectFile');
    if (targetSelect.options[0]) targetSelect.options[0].textContent = t('selectFile');
    if (trackSelect.options[0]) trackSelect.options[0].textContent = t('selectTrack');

    // Batch Mode
    document.querySelector('label[for="batch-source-folder"]').textContent = t('sourceFolder');
    document.querySelector('label[for="batch-target-folder"]').textContent = t('targetFolder');
    batchSourceFolder.placeholder = t('selectSourceFolder');
    batchTargetFolder.placeholder = t('selectTargetFolder');
    batchSourceBrowse.textContent = t('browse');
    batchTargetBrowse.textContent = t('browse');

    // Buttons
    syncBtn.textContent = t('startSync');
    if (cancelBtn.textContent !== t('cancelling')) {
        cancelBtn.textContent = t('cancelOp');
    }
    openFolderBtn.textContent = t('openOutputFolder');

    // Language selector
    document.getElementById('lang-label').textContent = t('language');
}

module.exports = { t, setLanguage, updateUI };
