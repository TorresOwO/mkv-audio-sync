const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const inputAudio = path.join(__dirname, 'output', 'galego_converted.mkv');
const inputVideo = path.join(__dirname, 'inputs', 'video_final.mkv');
const output = path.join(__dirname, 'output', 'final_tagged.mkv');

// Offset calculated: -0.9515s (Audio is early)
// Delay needed: +0.9515s
const delay = '0.9515';

console.log('Starting metadata fix process...');
console.log(`Audio Source: ${inputAudio}`);
console.log(`Video Source: ${inputVideo}`);
console.log(`Output: ${output}`);

const args = [
    // Input 0: Galego Audio (needs delay)
    '-itsoffset', delay,
    '-i', inputAudio,

    // Input 1: Video/Original Audio/Subs
    '-i', inputVideo,

    // Map Video first (Standard)
    '-map', '1:v',

    // Map Galego Audio second
    '-map', '0:a',

    // Map Original Audio third
    '-map', '1:a',

    // Map Subtitles
    '-map', '1:s?',

    // Metadata for Galego Audio (Stream #1 in output, since Video is #0)
    '-metadata:s:a:0', 'language=gl',
    '-metadata:s:a:0', 'title=Galego',
    '-disposition:a:0', 'default', // Make it default

    // Metadata for Original Audio (Stream #2 in output)
    '-metadata:s:a:1', 'title=Original',
    '-disposition:a:1', '0', // Not default

    // Copy all streams
    '-c', 'copy',

    '-y',
    output
];

const child = execFile(ffmpeg, args, (error, stdout, stderr) => {
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Remux completed successfully!');
});

child.stderr.on('data', (data) => {
    console.log(data.toString());
});
