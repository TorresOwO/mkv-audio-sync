const { getMediaInfo } = require('./lib/ffmpeg');
const path = require('path');

async function checkDurations() {
    const outputDir = path.join(process.cwd(), 'output');

    const files = [
        path.join(outputDir, 'converted_full.mkv'),
        path.join(outputDir, 'corrected_audio.ac3'),
        path.join(process.cwd(), 'inputs', 'Breaking_Bad_5x01_Live_Free_Or_Die.mkv')
    ];

    for (const file of files) {
        try {
            const info = await getMediaInfo(file);
            console.log(`${path.basename(file)}:`);
            console.log(`  Duration: ${info.duration}`);
            console.log(`  FPS: ${info.fps}`);
            console.log('');
        } catch (e) {
            console.log(`${path.basename(file)}: File not found or error`);
        }
    }
}

checkDurations();
