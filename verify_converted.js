const ffmpeg = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');

const output = path.join(__dirname, 'output', 'galego_converted.mkv');

execFile(ffmpeg, ['-i', output], (error, stdout, stderr) => {
    const durationMatch = stderr.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
    if (durationMatch) {
        console.log(`File: ${path.basename(output)}`);
        console.log(`Duration: ${durationMatch[1]}`);
    } else {
        console.log(`Could not find duration for ${path.basename(output)}`);
    }
});
