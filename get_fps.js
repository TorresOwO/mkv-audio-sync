const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const files = [
    path.join(__dirname, 'inputs', 'galego.mkv'),
    path.join(__dirname, 'inputs', 'video_final.mkv')
];

files.forEach(file => {
    execFile(ffmpeg, ['-i', file], (error, stdout, stderr) => {
        const fpsMatch = stderr.match(/(\d+(?:\.\d+)?) fps/);
        if (fpsMatch) {
            console.log(`File: ${path.basename(file)}`);
            console.log(`FPS: ${fpsMatch[1]}`);
        } else {
            console.log(`Could not find FPS for ${path.basename(file)}`);
        }
    });
});
