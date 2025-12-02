const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { getMkvFiles } = require('./lib/utils');
const { getMediaInfo, convertFps, extractAudioTrack, cleanAudio, encodeAudio } = require('./lib/ffmpeg');
const { getMkvInfo, mergeFiles } = require('./lib/mkv');
const { execFile } = require('child_process');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        backgroundColor: '#1e1e1e'
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

let activeProcess = null;
let isCancelled = false;

// IPC Handlers

// Log to renderer
function log(message, type = 'info') {
    if (mainWindow) {
        mainWindow.webContents.send('log', { message, type });
    }
    console.log(message);
}

function sendProgress(percent, text = '') {
    if (mainWindow) {
        mainWindow.webContents.send('progress', { percent, text });
    }
}

ipcMain.handle('cancel-sync', async () => {
    if (activeProcess) {
        log('Cancelling active process...', 'warning');
        isCancelled = true;
        try {
            activeProcess.kill('SIGKILL'); // Force kill
        } catch (e) {
            log(`Error killing process: ${e.message}`, 'error');
        }
        activeProcess = null;
        return true;
    }
    isCancelled = true; // Set flag even if no process to stop loops
    return true;
});

ipcMain.handle('get-files', async () => {
    const cwd = process.cwd();
    const inputDir = path.join(cwd, 'inputs');
    let files = getMkvFiles(cwd);
    if (fs.existsSync(inputDir)) {
        files = files.concat(getMkvFiles(inputDir));
    }
    return files;
});

ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'MKV Files', extensions: ['mkv'] }]
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-output-folder', async () => {
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    await shell.openPath(outputDir);
    return true;
});

ipcMain.handle('get-media-info', async (event, filePath) => {
    try {
        return await getMediaInfo(filePath);
    } catch (error) {
        throw error;
    }
});

// Core Sync Logic (Reusable)
async function processSync(sourceFile, targetFile, trackIndex) {
    if (isCancelled) throw new Error('Operation cancelled by user');

    log(`Processing: ${path.basename(sourceFile)} -> ${path.basename(targetFile)}`, 'info');
    sendProgress(0, 'Initializing...');

    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    const sourceInfo = await getMediaInfo(sourceFile);
    const targetInfo = await getMediaInfo(targetFile);

    let audioSourceForSync = sourceFile;

    // FPS Conversion
    if (Math.abs(sourceInfo.fps - targetInfo.fps) > 0.1) {
        if (isCancelled) throw new Error('Operation cancelled');
        log(`FPS mismatch (${sourceInfo.fps} vs ${targetInfo.fps}). Converting...`, 'warning');
        sendProgress(0, 'Converting FPS...');

        const convertedFile = path.join(outputDir, `converted_${Date.now()}.mkv`);
        await convertFps(sourceFile, convertedFile, targetInfo.fps, (progress, text) => {
            sendProgress(progress, text || 'Converting...');
        }, (child) => { activeProcess = child; });

        activeProcess = null;
        audioSourceForSync = convertedFile;
        log('Conversion complete.', 'success');
    }

    // Extraction
    if (isCancelled) throw new Error('Operation cancelled');
    log('Extracting and cleaning audio...', 'info');
    sendProgress(-1, 'Extracting Audio...');

    const audioRaw = path.join(outputDir, `audio_extracted_${Date.now()}.ac3`);
    const audioClean = path.join(outputDir, `audio_clean_${Date.now()}.ac3`);

    await extractAudioTrack(audioSourceForSync, trackIndex, audioRaw, (child) => { activeProcess = child; });
    activeProcess = null;

    if (isCancelled) throw new Error('Operation cancelled');
    sendProgress(-1, 'Cleaning Audio...');
    await cleanAudio(audioRaw, audioClean, 192, (progress, text) => {
        sendProgress(progress, text || 'Cleaning Audio...');
    }, (child) => { activeProcess = child; });
    activeProcess = null;

    audioSourceForSync = audioClean;
    log('Audio extracted and cleaned.', 'success');

    // Sync
    if (isCancelled) throw new Error('Operation cancelled');
    log('Calculating sync offset...', 'info');
    sendProgress(-1, 'Synchronizing...');
    const syncedWav = path.join(outputDir, `synced_audio_${Date.now()}.wav`);

    await new Promise((resolve, reject) => {
        const isDev = !app.isPackaged;
        const scriptPath = isDev
            ? path.join(__dirname, 'adaptive_sync.py')
            : path.join(process.resourcesPath, 'adaptive_sync.py');

        const child = execFile('python', [scriptPath, audioSourceForSync, targetFile, syncedWav], (error, stdout, stderr) => {
            if (error) {
                if (isCancelled) {
                    reject(new Error('Operation cancelled'));
                } else {
                    log(`Sync Error: ${stdout}`, 'error');
                    reject(error);
                }
            } else {
                log(stdout);
                resolve();
            }
        });
        activeProcess = child;
    });
    activeProcess = null;
    log('Sync complete.', 'success');

    // Encode
    if (isCancelled) throw new Error('Operation cancelled');
    log('Encoding to AC3...', 'info');
    sendProgress(-1, 'Encoding Final Audio...');
    const finalAudio = path.join(outputDir, `synced_audio_${Date.now()}.ac3`);
    await encodeAudio(syncedWav, finalAudio, 'ac3', 192);

    // Merge
    if (isCancelled) throw new Error('Operation cancelled');
    log('Merging files...', 'info');
    sendProgress(-1, 'Merging...');
    const outputName = path.basename(targetFile, path.extname(targetFile)) + '_synced.mkv';
    const finalOutput = path.join(outputDir, outputName);

    // Metadata
    let audioMetadata = { language: 'und', title: 'Synced Audio' };
    try {
        const info = await getMkvInfo(sourceFile);
        const track = info.tracks.find(t => t.id === parseInt(trackIndex));
        if (track && track.properties) {
            if (track.properties.language) audioMetadata.language = track.properties.language;
            if (track.properties.track_name) audioMetadata.title = track.properties.track_name;
        }
    } catch (e) {
        log('Could not fetch metadata, using defaults.');
    }

    const inputs = [
        {
            path: finalAudio,
            options: [
                '--sync', '0:0',
                '--language', `0:${audioMetadata.language}`,
                '--track-name', `0:${audioMetadata.title}`,
                '--default-track', '0:yes'
            ]
        },
        {
            path: targetFile,
            options: []
        }
    ];

    await mergeFiles(finalOutput, inputs);
    log(`Merge successful! Output: ${finalOutput}`, 'success');

    // Cleanup
    const tempFiles = [audioRaw, audioClean, syncedWav, finalAudio];
    if (audioSourceForSync.includes('converted_')) tempFiles.push(audioSourceForSync);

    for (const file of tempFiles) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    return finalOutput;
}

ipcMain.handle('start-sync', async (event, { sourceFile, targetFile, trackIndex }) => {
    try {
        isCancelled = false;
        sendProgress(0, 'Starting...');
        log('Starting sync process...', 'info');

        const outputPath = await processSync(sourceFile, targetFile, trackIndex);

        sendProgress(100, 'Done!');
        shell.showItemInFolder(outputPath);
        return { success: true, outputPath };

    } catch (error) {
        if (error.message.includes('cancelled')) {
            log('Process cancelled by user.', 'warning');
        } else {
            log(`Error: ${error.message}`, 'error');
        }
        sendProgress(0, 'Cancelled');
        throw error;
    } finally {
        activeProcess = null;
        isCancelled = false;
    }
});

ipcMain.handle('start-batch-sync', async (event, { sourceFolder, targetFolder }) => {
    try {
        isCancelled = false;
        sendProgress(0, 'Scanning files...');
        log('Starting Batch Sync...', 'info');

        const sourceFiles = fs.readdirSync(sourceFolder).filter(f => f.endsWith('.mkv'));
        const targetFiles = fs.readdirSync(targetFolder).filter(f => f.endsWith('.mkv'));

        log(`Found ${sourceFiles.length} source files and ${targetFiles.length} target files.`);

        // Match files
        const matches = [];
        const regexes = [
            /(\d+)[xX](\d+)/, // 5x05
            /[sS](\d+)[eE](\d+)/, // S05E05
            /(\d+)/ // Just a number
        ];

        for (const sFile of sourceFiles) {
            let sMatch = null;
            for (const r of regexes) {
                const m = sFile.match(r);
                if (m) {
                    sMatch = { full: m[0], s: m[1], e: m[2] || m[1] }; // Handle single number case
                    break;
                }
            }

            if (!sMatch) continue;

            // Find counterpart in target
            for (const tFile of targetFiles) {
                let tMatch = null;
                for (const r of regexes) {
                    const m = tFile.match(r);
                    if (m) {
                        tMatch = { full: m[0], s: m[1], e: m[2] || m[1] };
                        break;
                    }
                }

                if (tMatch && parseInt(sMatch.s) === parseInt(tMatch.s) && parseInt(sMatch.e) === parseInt(tMatch.e)) {
                    matches.push({
                        source: path.join(sourceFolder, sFile),
                        target: path.join(targetFolder, tFile)
                    });
                    break;
                }
            }
        }

        log(`Matched ${matches.length} pairs.`);
        if (matches.length === 0) {
            log('No matches found. Check file naming.', 'error');
            return { success: false };
        }

        let completed = 0;
        for (const match of matches) {
            if (isCancelled) {
                log('Batch processing cancelled.', 'warning');
                break;
            }

            log(`Batch ${completed + 1}/${matches.length}: ${path.basename(match.source)}`, 'info');
            sendProgress((completed / matches.length) * 100, `Batch: ${completed + 1}/${matches.length} - ${path.basename(match.source)}`);

            try {
                // Default to track 0 or 1? We'll assume 1 (usually main audio) or need to analyze.
                // For batch, let's auto-detect the best track or default to 0 (first track).
                // Better yet, let's analyze and pick the first audio track.
                const info = await getMediaInfo(match.source);
                const trackIndex = info.audioTracks.length > 0 ? info.audioTracks[0].index : 1;

                await processSync(match.source, match.target, trackIndex);
            } catch (e) {
                if (e.message.includes('cancelled')) {
                    throw e; // Propagate cancel
                }
                log(`Failed to sync ${path.basename(match.source)}: ${e.message}`, 'error');
            }
            completed++;
            sendProgress((completed / matches.length) * 100, `Batch: ${completed}/${matches.length} Done`);
        }

        log('Batch processing complete!', 'success');
        return { success: true };

    } catch (error) {
        if (error.message.includes('cancelled')) {
            log('Batch cancelled.', 'warning');
        } else {
            log(`Batch Error: ${error.message}`, 'error');
        }
        sendProgress(0, 'Cancelled');
        throw error;
    } finally {
        activeProcess = null;
        isCancelled = false;
    }
});
