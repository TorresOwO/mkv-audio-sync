const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const files = [
    path.join(__dirname, 'inputs', 'galego.mkv'),
    path.join(__dirname, 'inputs', 'video_final.mkv')
];

files.forEach(file => {
    execFile(ffmpeg, ['-i', file], (error, stdout, stderr) => {
        const durationMatch = stderr.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (durationMatch) {
            console.log(`File: ${path.basename(file)}`);
            console.log(`Duration: ${durationMatch[1]}`);
        } else {
            console.log(`Could not find duration for ${path.basename(file)}`);
        }
    });
});
