const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const inputAudio = path.join(__dirname, 'output', 'galego_converted.mkv');
const inputVideo = path.join(__dirname, 'inputs', 'video_final.mkv');
const output = path.join(__dirname, 'output', 'final_synced.mkv');

// Offset calculated: -0.9515s (Audio is early)
// Delay needed: +0.9515s (951.5ms)
const delay = 952; // Rounding to nearest ms

console.log('Starting final merge process...');
console.log(`Audio Source: ${inputAudio}`);
console.log(`Video Source: ${inputVideo}`);
console.log(`Delay: ${delay}ms`);
console.log(`Output: ${output}`);

const args = [
    '-i', inputAudio,
    '-i', inputVideo,
    '-map', '0:a',       // Map audio from converted galego
    '-map', '1:v',       // Map video from video_final
    '-map', '1:a',       // Map original audio from video_final (optional, keep as secondary?) 
    // User asked for "todas las pistas de audio de galego.mkv y el video y dem'as pistas de video, audio y subtitlos de video_final.mkv"
    // So we map 0:a AND 1:a.
    '-map', '1:s?',      // Map subtitles
    '-c', 'copy',        // Copy all streams (video is already compatible, audio is already converted)
    // WAIT! We need to apply delay to 0:a.
    // We can use -itsoffset for input 0, but that shifts the whole file.
    // Since we are mapping 0:a, we can use -itsoffset before -i inputAudio.
];

// Re-constructing args for -itsoffset
const finalArgs = [
    '-itsoffset', '0.9515', // Apply delay to the NEXT input
    '-i', inputAudio,
    '-i', inputVideo,
    '-map', '0:a',
    '-map', '1:v',
    '-map', '1:a',
    '-map', '1:s?',
    '-c', 'copy',        // Copy everything. Audio is already AAC from conversion.
    '-y',
    output
];

const child = execFile(ffmpeg, finalArgs, (error, stdout, stderr) => {
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Final merge completed successfully!');
});

child.stderr.on('data', (data) => {
    console.log(data.toString());
});
