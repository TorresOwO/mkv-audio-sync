const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

function runCommand(args) {
    return new Promise((resolve, reject) => {
        const child = execFile(ffmpeg, args, (error, stdout, stderr) => {
            if (error) {
                // Include stderr in rejection so we can still parse ffmpeg info
                reject({ error, stderr, stdout });
            } else {
                resolve({ stdout, stderr });
            }
        });
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
            fps = 24000 / 1001; // 23.976023976...
        }
        // 29.97 is actually 30000/1001 = 29.970029970...
        else if (Math.abs(fps - 29.97) < 0.01) {
            fps = 30000 / 1001;
        }
        // 59.94 is actually 60000/1001 = 59.940059940...
        else if (Math.abs(fps - 59.94) < 0.01) {
            fps = 60000 / 1001;
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

function convertFps(input, output, targetFps) {
    const args = [
        '-i', input,
        '-filter_complex', `[0:v]setpts=25/${targetFps}*PTS[v];[0:a]asetrate=48000*(${targetFps}/25),aresample=48000[a]`,
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '192k',
        '-y',
        output
    ];

    return runCommand(args);
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

module.exports = {
    getMediaInfo,
    convertFps,
    mergeFiles
};
