const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getMkvFiles } = require('./lib/utils');
const { getMediaInfo, convertFps, mergeFiles } = require('./lib/ffmpeg');

async function main() {
    console.log('=== MKV Audio Sync CLI ===');

    const mkvFiles = getMkvFiles(process.cwd());
    const inputDir = path.join(process.cwd(), 'inputs');
    if (fs.existsSync(inputDir)) {
        const inputFiles = getMkvFiles(inputDir);
        mkvFiles.push(...inputFiles);
    }

    if (mkvFiles.length === 0) {
        console.log('No MKV files found in current directory or inputs/ folder.');
        return;
    }

    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'sourceFile',
            message: 'Select the Source MKV (Audio provider, e.g., galego.mkv):',
            choices: mkvFiles
        },
        {
            type: 'list',
            name: 'targetFile',
            message: 'Select the Target MKV (Video provider, e.g., video_final.mkv):',
            choices: mkvFiles
        }
    ]);

    console.log('\nAnalyzing files...');
    const sourceInfo = await getMediaInfo(answers.sourceFile);
    const targetInfo = await getMediaInfo(answers.targetFile);

    console.log(`Source FPS: ${sourceInfo.fps}`);
    console.log(`Target FPS: ${targetInfo.fps}`);

    // Track Selection
    let selectedTrackIndex = 0;
    if (sourceInfo.audioTracks.length > 1) {
        const trackAnswers = await inquirer.prompt([
            {
                type: 'list',
                name: 'track',
                message: 'Select the audio track to extract from Source:',
                choices: sourceInfo.audioTracks.map(t => ({
                    name: `${t.index}: ${t.lang} - ${t.details}`,
                    value: t.index
                }))
            }
        ]);
        selectedTrackIndex = trackAnswers.track;
    }

    // FPS Conversion Logic
    let audioSourceForSync = answers.sourceFile;
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    if (Math.abs(sourceInfo.fps - targetInfo.fps) > 0.1) {
        console.log(`\nFPS mismatch detected (${sourceInfo.fps} vs ${targetInfo.fps}). Conversion required.`);
        const confirm = await inquirer.prompt([{
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed with FPS conversion (this may take a while)?',
            default: true
        }]);

        if (!confirm.proceed) return;

        const convertedFile = path.join(outputDir, 'converted_temp.mkv');
        console.log('Converting source file...');
        try {
            await convertFps(answers.sourceFile, convertedFile, targetInfo.fps);
            console.log('Conversion complete.');
            audioSourceForSync = convertedFile;
        } catch (e) {
            console.error('Conversion failed:', e);
            return;
        }
    } else {
        console.log('\nFPS match. Skipping conversion.');
    }

    // Offset Calculation
    console.log('\nCalculating sync offset...');
    const offset = await calculateOffset(audioSourceForSync, answers.targetFile);
    console.log(`Calculated Offset: ${offset} seconds`);

    // Final Merge
    const finalOutput = path.join(outputDir, 'synced_output.mkv');
    console.log(`\nMerging into ${finalOutput}...`);

    // We need to invert the offset logic for the delay parameter?
    // calculate_offset.py returns: "If positive, file1 starts LATER (needs negative delay)"
    // So delay = -offset.
    // Wait, let's check my previous manual run.
    // Previous result: -0.9515.
    // Manual merge used: +0.9515.
    // So Delay = -Offset.

    const delay = -parseFloat(offset);
    console.log(`Applying Delay: ${delay}s`);

    try {
        await mergeFiles(audioSourceForSync, answers.targetFile, finalOutput, delay);
        console.log('Merge successful!');
    } catch (e) {
        console.error('Merge failed:', e);
    }
}

function calculateOffset(file1, file2) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'calculate_offset.py');
        execFile('python', [scriptPath, file1, file2], (error, stdout, stderr) => {
            if (error) {
                // If python fails, maybe try to read the file anyway if it was written
            }

            // Read the offset.txt file which is more reliable
            try {
                const offset = fs.readFileSync('offset.txt', 'utf-8').trim();
                resolve(offset);
            } catch (e) {
                reject('Could not read offset from file.');
            }
        });
    });
}

main();
