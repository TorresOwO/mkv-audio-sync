const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const input = path.join(__dirname, 'inputs', 'galego.mkv');
const output = path.join(__dirname, 'output', 'galego_converted.mkv');

console.log('Starting conversion process...');
console.log(`Input: ${input}`);
console.log(`Output: ${output}`);

const args = [
    '-i', input,
    '-filter_complex', '[0:v]setpts=25/23.976*PTS[v];[0:a]asetrate=48000*(23.976/25),aresample=48000[a]',
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-y',
    output
];

const child = execFile(ffmpeg, args, (error, stdout, stderr) => {
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Conversion completed successfully!');
});

child.stderr.on('data', (data) => {
    console.log(data.toString());
});
