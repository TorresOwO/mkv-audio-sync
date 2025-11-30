const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getMkvFiles } = require('./lib/utils');
const { getMediaInfo, convertFps, extractAudioTrack, cleanAudio, encodeAudio } = require('./lib/ffmpeg');
const { getMkvInfo, mergeFiles } = require('./lib/mkv');

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

    // Audio Extraction and Cleaning
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎵 Extrayendo y limpiando audio...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const audioRaw = path.join(outputDir, 'audio_extracted.ac3');
    const audioClean = path.join(outputDir, 'audio_clean.ac3');

    try {
        // Extract audio track from source (or converted source)
        await extractAudioTrack(audioSourceForSync, selectedTrackIndex, audioRaw);

        // Clean and repair timestamps
        await cleanAudio(audioRaw, audioClean, 192);

        // Update source to use the cleaned audio for offset calculation and merge
        audioSourceForSync = audioClean;

        console.log('✅ Audio extraído y limpiado correctamente\n');
    } catch (e) {
        console.error('❌ Error en extracción/limpieza de audio:', e.error ? e.error.message : e);
        // If extraction/cleaning fails, continue with the original file
        console.log('⚠️  Continuando con archivo original...');
    }

    // Smart Synchronization
    console.log('\nCalculating sync offset and generating synchronized audio...');
    const syncedWav = path.join(outputDir, 'synced_audio.wav');

    try {
        await smartSynchronize(audioSourceForSync, answers.targetFile, syncedWav);
        console.log('✅ Synchronized audio generated.');
    } catch (e) {
        console.error('❌ Synchronization failed:', e);
        return;
    }

    // Encode to AC3 (or match source?)
    // For now let's stick to AC3 192k as per previous logic
    const finalAudio = path.join(outputDir, 'synced_audio.ac3');
    try {
        await encodeAudio(syncedWav, finalAudio, 'ac3', 192);
        console.log('✅ Audio encoded to AC3.');
    } catch (e) {
        console.error('❌ Encoding failed:', e);
        return;
    }

    // Final Merge
    const finalOutput = path.join(outputDir, 'synced_output.mkv');
    console.log(`\nMerging into ${finalOutput}...`);

    // No delay needed as audio is already synced
    const delay = 0;

    // Metadata extraction from original source
    let audioMetadata = {
        language: 'und',
        title: 'Synced Audio'
    };

    try {
        const info = await getMkvInfo(answers.sourceFile);
        // Find the track corresponding to selectedTrackIndex
        // selectedTrackIndex comes from ffmpeg stream index, which usually matches MKV track ID for audio if no complex structure
        // But let's try to find by ID first
        // Note: selectedTrackIndex is a string from inquirer value, convert to number if needed
        const trackId = parseInt(selectedTrackIndex);
        const track = info.tracks.find(t => t.id === trackId);
        if (track && track.properties) {
            if (track.properties.language) audioMetadata.language = track.properties.language;
            if (track.properties.track_name) audioMetadata.title = track.properties.track_name;
            console.log(`Preserving metadata: Language=${audioMetadata.language}, Title=${audioMetadata.title}`);
        }
    } catch (e) {
        console.warn('Could not fetch metadata from source, using defaults.', e.message);
    }

    const inputs = [
        {
            path: finalAudio,
            options: [
                '--sync', `0:${delay}`,
                '--language', `0:${audioMetadata.language}`,
                '--track-name', `0:${audioMetadata.title}`,
                '--default-track', '0:yes'
            ]
        },
        {
            path: answers.targetFile,
            options: [
                // Append all tracks from target file
            ]
        }
    ];

    try {
        await mergeFiles(finalOutput, inputs);
        console.log('Merge successful!');

        // Clean up temporary files
        console.log('\nCleaning up temporary files...');
        const tempFiles = [
            audioRaw,              // audio_extracted.ac3
            audioClean,            // audio_clean.ac3
            syncedWav,             // synced_audio.wav
            finalAudio             // synced_audio.ac3
        ];

        // Add converted file if it was created
        if (audioSourceForSync.includes('converted_temp.mkv')) {
            tempFiles.push(path.join(outputDir, 'converted_temp.mkv'));
        }

        let cleanedCount = 0;
        for (const file of tempFiles) {
            try {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                    cleanedCount++;
                }
            } catch (err) {
                console.warn(`Could not delete ${path.basename(file)}: ${err.message}`);
            }
        }

        console.log(`✅ Cleaned up ${cleanedCount} temporary file(s)`);
        console.log(`\n✨ Final output: ${finalOutput}`);
    } catch (e) {
        console.error('Merge failed:', e);
    }
}

function smartSynchronize(sourceFile, referenceFile, outputFile) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'adaptive_sync.py');
        console.log('Running adaptive synchronization...');
        execFile('python', [scriptPath, sourceFile, referenceFile, outputFile], (error, stdout, stderr) => {
            if (error) {
                console.error(stdout); // Python script prints to stdout
                reject(error);
            } else {
                console.log(stdout);
                resolve();
            }
        });
    });
}

main();
