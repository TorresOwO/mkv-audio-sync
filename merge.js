const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const input1 = path.join(__dirname, 'inputs', 'galego.mkv');
const input2 = path.join(__dirname, 'inputs', 'video_final.mkv');
const output = path.join(__dirname, 'output.mkv');

console.log('Starting merge process...');
console.log(`Input 1 (Audio Source): ${input1}`);
console.log(`Input 2 (Video/Audio/Subs Source): ${input2}`);
console.log(`Output: ${output}`);

const args = [
    '-i', input1,
    '-i', input2,
    '-filter_complex', '[0:a]asetrate=48000*(23.976/25),aresample=48000[a]', // Slow down audio
    '-map', '[a]',       // Map the filtered audio
    '-map', '1:v',       // Map all video from input 1
    '-map', '1:s?',      // Map all subtitles from input 1
    '-c:v', 'copy',      // Copy video
    '-c:s', 'copy',      // Copy subtitles
    '-c:a', 'aac',       // Re-encode audio to AAC
    '-b:a', '192k',      // Audio bitrate
    '-y',                // Overwrite output
    output
];

const child = execFile(ffmpeg, args, (error, stdout, stderr) => {
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Merge completed successfully!');
});

child.stderr.on('data', (data) => {
    // ffmpeg writes progress to stderr
    console.log(data.toString());
});
