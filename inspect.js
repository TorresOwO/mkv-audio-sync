const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const input1 = path.join(__dirname, 'inputs', 'galego.mkv');
const input2 = path.join(__dirname, 'inputs', 'video_final.mkv');

function inspect(file) {
    return new Promise((resolve) => {
        execFile(ffmpeg, ['-i', file], (error, stdout, stderr) => {
            // ffmpeg outputs info to stderr
            console.log(`--- Info for ${path.basename(file)} ---`);
            console.log(stderr);
            resolve();
        });
    });
}

async function run() {
    await inspect(input1);
    await inspect(input2);
}

run();
