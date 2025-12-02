const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let mkvmergePath = 'mkvmerge'; // Default to global path

function setMkvMergePath(inputPath) {
    if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
        mkvmergePath = path.join(inputPath, 'mkvmerge.exe');
    } else {
        mkvmergePath = inputPath;
    }
}

async function checkMkvMerge() {
    // 1. Try global command
    if (await tryExec('mkvmerge')) {
        mkvmergePath = 'mkvmerge';
        return true;
    }

    // 2. Try common Windows paths
    const commonPaths = [
        'C:\\Program Files\\MKVToolNix\\mkvmerge.exe',
        'C:\\Program Files (x86)\\MKVToolNix\\mkvmerge.exe'
    ];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            mkvmergePath = p;
            return true;
        }
    }

    return false;
}

function tryExec(cmd) {
    return new Promise((resolve) => {
        execFile(cmd, ['--version'], (error) => {
            resolve(!error);
        });
    });
}

function mergeFilesMkvMerge(inputAudio, inputVideo, output, delay, audioTrackIndex) {
    // mkvmerge -o output.mkv --sync 0:delay input_audio.mkv input_video.mkv
    // We need to map specific tracks.
    // Strategy:
    // 1. Take audio from inputAudio (which is the converted/extracted audio).
    //    Usually it has 1 track (track 0) if it came from our conversion.
    // 2. Take video and other tracks from inputVideo.

    // Note: mkvmerge track IDs are 0-based per file in the command line context usually, 
    // but --sync 0:delay refers to track ID 0 of the file it follows? 
    // Actually, --sync <TID:d> applies to track with ID <TID>.

    // Let's construct the command carefully.
    // mkvmerge -o output.mkv 
    // --language 0:gl --track-name 0:Galego --default-track 0:yes --sync 0:delay inputAudio
    // --track-order 0:0,1:0,1:1... (This is complex to guess without scanning)

    // Simpler approach:
    // Input 0: Audio file (usually just 1 audio track)
    // Input 1: Video file

    const args = [
        '-o', output,

        // Input 0: The audio source (converted or original)
        // We assume track 0 is the one we want if it's a single-track file from conversion.
        // If it's the original source file, we might need to select the specific track.
        // But the CLI logic usually extracts/converts first, so inputAudio might be a temp file.
        // If it's the original file, we need to know which track ID to pick.
        // For now, let's assume inputAudio is the file containing the target audio.

        '--language', '0:gl',
        '--track-name', '0:Galego',
        '--default-track', '0:yes',
        '--sync', `0:${delay}`, // delay in ms
        inputAudio,

        // Input 1: The video source
        // We want to keep video, subs, and maybe original audio as secondary.
        inputVideo
    ];

    return new Promise((resolve, reject) => {
        const child = execFile(mkvmergePath, args, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr, stdout });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

module.exports = {
    setMkvMergePath,
    checkMkvMerge,
    mergeFilesMkvMerge
};
