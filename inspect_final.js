const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const file = path.join(__dirname, 'output', 'final_synced.mkv');

execFile(ffmpeg, ['-i', file], (error, stdout, stderr) => {
    console.log(`--- Metadata for ${path.basename(file)} ---`);
    console.log(stderr);
});
