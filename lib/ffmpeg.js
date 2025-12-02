const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

function runCommand(args, onStart) {
    return new Promise((resolve, reject) => {
        const child = execFile(ffmpeg, args, (error, stdout, stderr) => {
            if (error) {
                // Include stderr in rejection so we can still parse ffmpeg info
                reject({ error, stderr, stdout });
            } else {
                resolve({ stdout, stderr });
            }
        });

        if (onStart) onStart(child);
    });
}

async function getMediaInfo(file) {
    try {
        const { stderr } = await runCommand(['-i', file]);
        return parseInfo(stderr, file);
    } catch (e) {
        // ffmpeg returns exit code 1 when no output file is specified, but stderr has the info
        return parseInfo(e.stderr || '', file);
    }
}

function parseInfo(stderr, file) {
    const durationMatch = stderr.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);

    // Try to get tbr (true bit rate) which is more accurate
    // Format: "25 tbr" or "23.976 tbr"
    let fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s+tbr/);

    // Fallback to fps if tbr not found
    if (!fpsMatch) {
        fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s+fps/);
    }

    let fps = fpsMatch ? parseFloat(fpsMatch[1]) : null;

    // Normalize common rounded values to their precise equivalents
    if (fps !== null) {
        // 23.98 is actually 24000/1001 = 23.976023976...
        if (Math.abs(fps - 23.98) < 0.01) {
            fps = Math.round((24000 / 1001) * 1000) / 1000; // 23.976023976...
        }
        // 29.97 is actually 30000/1001 = 29.970029970...
        else if (Math.abs(fps - 29.97) < 0.01) {
            fps = Math.round((30000 / 1001) * 1000) / 1000;
        }
        // 59.94 is actually 60000/1001 = 59.940059940...
        else if (Math.abs(fps - 59.94) < 0.01) {
            fps = Math.round((60000 / 1001) * 1000) / 1000;
        }
    }

    // Parse streams to find audio tracks
    const audioTracks = [];
    const lines = stderr.split('\n');
    lines.forEach(line => {
        const match = line.match(/Stream #0:(\d+)(?:\(([a-zA-Z]+)\))?: Audio/);
        if (match) {
            audioTracks.push({
                index: match[1],
                lang: match[2] || 'und',
                details: line.trim()
            });
        }
    });

    return {
        file,
        duration: durationMatch ? durationMatch[1] : null,
        fps: fps,
        audioTracks
    };
}

function convertFps(input, output, targetFps, onProgress, onStart) {
    const args = [
        '-i', input,
        '-filter_complex', `[0:v]setpts=25/${targetFps}*PTS,scale=320:-1[v];[0:a]asetrate=48000*(${targetFps}/25),aresample=48000[a]`,
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
        '-c:a', 'aac', '-b:a', '192k',
        '-y',
        output
    ];

    return new Promise((resolve, reject) => {
        const child = execFile(ffmpeg, args, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr, stdout });
            } else {
                resolve({ stdout, stderr });
            }
        });

        if (onStart) onStart(child);

        let duration = null;
        let lastProgress = -1;

        child.stderr.on('data', (data) => {
            const output = data.toString();

            // Parse duration from ffmpeg output
            if (!duration) {
                const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                if (durationMatch) {
                    const [_, h, m, s] = durationMatch;
                    duration = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
                }
            }

            // Parse current time
            const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (timeMatch && duration) {
                const [_, h, m, s] = timeMatch;
                const currentTime = parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
                const progress = Math.min(100, Math.floor((currentTime / duration) * 100));

                // Update every 1% for smooth animation (using \r to overwrite the same line)
                if (progress !== lastProgress) {
                    lastProgress = progress;
                    if (onProgress) onProgress(progress, `Converting: ${progress}%`);

                    // Emoji based on progress
                    let emoji;
                    if (progress < 25) emoji = '🎬';
                    else if (progress < 50) emoji = '🎞️';
                    else if (progress < 75) emoji = '🎥';
                    else if (progress < 100) emoji = '📹';
                    else emoji = '✨';

                    // Progress bar
                    const barLength = 20;
                    const filled = Math.floor((progress / 100) * barLength);
                    const empty = barLength - filled;
                    const bar = '█'.repeat(filled) + '░'.repeat(empty);

                    // Only write to stdout if no callback (CLI mode) or if we want both
                    if (!onProgress) {
                        process.stdout.write(`\r${emoji} Conversión: [${bar}] ${progress}%  `);
                        if (progress === 100) {
                            process.stdout.write('\n');
                        }
                    }
                }
            }
        });
    });
}

/**
 * Extracts an audio track from an MKV file
 * Tries mkvextract first (if available), falls back to ffmpeg
 * @param {string} inputFile - Input MKV file
 * @param {number} trackIndex - Audio track index (0-based for ffmpeg, actual track ID for mkvextract)
 * @param {string} outputFile - Output audio file (e.g., audio.ac3)
 */
function extractAudioTrack(inputFile, trackIndex, outputFile, onStart) {
    // First try mkvextract (if available in system PATH)
    return new Promise((resolve, reject) => {
        const { exec } = require('child_process');

        // Try mkvextract first
        const mkvExtractCmd = `mkvextract tracks "${inputFile}" ${trackIndex}:"${outputFile}"`;

        exec('mkvextract --version', (error) => {
            if (!error) {
                // mkvextract is available, use it
                console.log(`🎵 Extrayendo audio con mkvextract (track ${trackIndex})...`);
                const child = exec(mkvExtractCmd, (extractError, stdout, stderr) => {
                    if (extractError) {
                        console.log('⚠️  mkvextract falló, intentando con ffmpeg...');
                        extractWithFFmpeg(inputFile, trackIndex, outputFile, onStart)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        console.log('✅ Audio extraído con mkvextract');
                        resolve({ stdout, stderr });
                    }
                });
                if (onStart) onStart(child);
            } else {
                // mkvextract not available, use ffmpeg
                console.log('ℹ️  mkvextract no disponible, usando ffmpeg...');
                extractWithFFmpeg(inputFile, trackIndex, outputFile, onStart)
                    .then(resolve)
                    .catch(reject);
            }
        });
    });
}

/**
 * Helper function to extract audio using ffmpeg
 */
function extractWithFFmpeg(inputFile, trackIndex, outputFile, onStart) {
    console.log(`🎵 Extrayendo audio con ffmpeg (stream 0:${trackIndex})...`);
    const args = [
        '-i', inputFile,
        '-map', `0:${trackIndex}`,
        '-c', 'copy',
        '-y',
        outputFile
    ];
    return runCommand(args, onStart).then((result) => {
        console.log('✅ Audio extraído con ffmpeg');
        return result;
    });
}

/**
 * Cleans audio stream by repairing timestamps and resampling
 * This is essential after FPS conversion or extraction
 * @param {string} inputAudio - Input audio file (e.g., audio_raw.ac3)
 * @param {string} outputAudio - Output cleaned audio file (e.g., audio_clean.ac3)
 * @param {number} bitrate - Audio bitrate in kbps (default: 192)
 */
function cleanAudio(inputAudio, outputAudio, bitrate = 192, onProgress, onStart) {
    console.log('🧹 Limpiando y reparando timestamps del audio...');
    const args = [
        '-fflags', '+genpts',           // Generate PTS timestamps
        '-i', inputAudio,
        '-af', 'aresample=async=1:first_pts=0',  // Resample with async correction
        '-c:a', 'ac3',                  // Re-encode to AC3
        '-b:a', `${bitrate}k`,          // Audio bitrate
        '-y',
        outputAudio
    ];

    return new Promise((resolve, reject) => {
        const child = execFile(ffmpeg, args, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr, stdout });
            } else {
                console.log('✅ Audio limpio y listo para usar');
                resolve({ stdout, stderr });
            }
        });

        if (onStart) onStart(child);

        // Show simple progress
        child.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.includes('time=')) {
                if (onProgress) onProgress(-1, 'Cleaning Audio...'); // Indeterminate progress
                else process.stdout.write('.');
            }
        });
    });
}

function mergeFiles(inputAudio, inputVideo, output, delay, audioTrackIndex) {
    const args = [
        '-itsoffset', String(delay),
        '-i', inputAudio,
        '-i', inputVideo,
        '-map', '1:v',      // Video from target
        '-map', '0:a',      // Audio from source (delayed)
        '-map', '1:a',      // Audio from target
        '-map', '1:s?',     // Subs from target
        '-metadata:s:a:0', 'language=gl',
        '-metadata:s:a:0', 'title=Galego',
        '-disposition:a:0', 'default',
        '-metadata:s:a:1', 'title=Original',
        '-disposition:a:1', '0',
        '-c', 'copy',
        '-y',
        output
    ];

    return runCommand(args);
}

/**
 * Encodes audio file to a specific codec and bitrate
 * @param {string} input - Input audio file (wav)
 * @param {string} output - Output audio file
 * @param {string} codec - Audio codec (e.g., ac3, aac)
 * @param {number} bitrate - Bitrate in kbps
 */
function encodeAudio(input, output, codec = 'ac3', bitrate = 192) {
    console.log(`🎵 Encoding audio to ${codec} (${bitrate}k)...`);
    const args = [
        '-i', input,
        '-c:a', codec,
        '-b:a', `${bitrate}k`,
        '-y',
        output
    ];
    return runCommand(args);
}

module.exports = {
    getMediaInfo,
    convertFps,
    extractAudioTrack,
    cleanAudio,
    mergeFiles,
    encodeAudio
};
