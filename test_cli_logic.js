const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getMediaInfo, convertFps, mergeFiles } = require('./lib/ffmpeg');

async function test() {
    console.log('=== Testing CLI Logic ===');

    const sourceFile = path.join(__dirname, 'inputs', 'galego.mkv');
    const targetFile = path.join(__dirname, 'inputs', 'video_final.mkv');
    const outputDir = path.join(__dirname, 'output');

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    console.log('1. Analyzing files...');
    const sourceInfo = await getMediaInfo(sourceFile);
    const targetInfo = await getMediaInfo(targetFile);
    console.log(`Source FPS: ${sourceInfo.fps}`);
    console.log(`Target FPS: ${targetInfo.fps}`);

    let audioSourceForSync = sourceFile;

    // Simulate FPS Check
    if (Math.abs(sourceInfo.fps - targetInfo.fps) > 0.1) {
        console.log('FPS mismatch. Converting...');
        const convertedFile = path.join(outputDir, 'test_converted.mkv');
        await convertFps(sourceFile, convertedFile, targetInfo.fps);
        audioSourceForSync = convertedFile;
    }

    // Simulate Offset Calculation
    console.log('2. Calculating Offset...');
    const offset = await calculateOffset(audioSourceForSync, targetFile);
    console.log(`Offset: ${offset}`);

    // Simulate Merge
    console.log('3. Merging...');
    const finalOutput = path.join(outputDir, 'test_final.mkv');
    const delay = -parseFloat(offset);
    await mergeFiles(audioSourceForSync, targetFile, finalOutput, delay);
    console.log('Test Complete!');
}

function calculateOffset(file1, file2) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'calculate_offset.py');
        execFile('python', [scriptPath, file1, file2], (error, stdout, stderr) => {
            try {
                const offset = fs.readFileSync('offset.txt', 'utf-8').trim();
                resolve(offset);
            } catch (e) {
                reject('Could not read offset from file.');
            }
        });
    });
}

test();
