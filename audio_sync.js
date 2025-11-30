const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getMediaInfo, convertFps, extractAudioTrack, cleanAudio, encodeAudio } = require('./lib/ffmpeg');
const { getMkvInfo, mergeFiles } = require('./lib/mkv');

async function main() {
    // Parse arguments
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.error('Usage: node audio_sync.js <source_mkv> <audio_track_index> <target_mkv> <output_name>');
        console.error('');
        console.error('Example:');
        console.error('  node audio_sync.js galego.mkv 1 video.mkv synced_output');
        console.error('');
        console.error('Arguments:');
        console.error('  source_mkv         - MKV file with the audio to sync (e.g., galego.mkv)');
        console.error('  audio_track_index  - Audio track index from source (usually 1)');
        console.error('  target_mkv         - MKV file to sync to (e.g., video_final.mkv)');
        console.error('  output_name        - Output filename without extension (e.g., synced_output)');
        process.exit(1);
    }

    const [sourceFile, audioTrackIndex, targetFile, outputName] = args;

    // Validate files exist
    if (!fs.existsSync(sourceFile)) {
        console.error(`Error: Source file not found: ${sourceFile}`);
        process.exit(1);
    }

    if (!fs.existsSync(targetFile)) {
        console.error(`Error: Target file not found: ${targetFile}`);
        process.exit(1);
    }

    const selectedTrackIndex = parseInt(audioTrackIndex);
    if (isNaN(selectedTrackIndex)) {
        console.error(`Error: Invalid audio track index: ${audioTrackIndex}`);
        process.exit(1);
    }

    console.log('=== MKV Audio Sync (Non-Interactive) ===\n');
    console.log(`Source:       ${sourceFile}`);
    console.log(`Audio Track:  ${selectedTrackIndex}`);
    console.log(`Target:       ${targetFile}`);
    console.log(`Output:       ${outputName}.mkv\n`);

    // Setup output directory
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('Analyzing files...');
    const sourceInfo = await getMediaInfo(sourceFile);
    const targetInfo = await getMediaInfo(targetFile);

    console.log(`Source FPS: ${sourceInfo.fps}`);
    console.log(`Target FPS: ${targetInfo.fps}`);

    let audioSourceForSync = sourceFile;

    // FPS Conversion if needed
    if (sourceInfo.fps !== targetInfo.fps) {
        console.log('\nFPS mismatch detected. Converting source to match target...');
        const convertedFile = path.join(outputDir, 'converted_temp.mkv');

        try {
            await convertFps(sourceFile, convertedFile, targetInfo.fps);
            console.log('✅ Conversion complete.');
            audioSourceForSync = convertedFile;
        } catch (e) {
            console.error('❌ Conversion failed:', e);
            process.exit(1);
        }
    } else {
        console.log('\nFPS match. Skipping conversion.');
    }

    // Audio Extraction and Cleaning
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎵 Extracting and cleaning audio...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const audioRaw = path.join(outputDir, 'audio_extracted.ac3');
    const audioClean = path.join(outputDir, 'audio_clean.ac3');

    try {
        await extractAudioTrack(audioSourceForSync, selectedTrackIndex, audioRaw);
        await cleanAudio(audioRaw, audioClean, 192);
        audioSourceForSync = audioClean;
        console.log('✅ Audio extracted and cleaned\n');
    } catch (e) {
        console.error('❌ Audio extraction/cleaning failed:', e.error ? e.error.message : e);
        process.exit(1);
    }

    // Smart Synchronization
    console.log('Calculating sync offset and generating synchronized audio...');
    const syncedWav = path.join(outputDir, 'synced_audio.wav');

    try {
        await smartSynchronize(audioSourceForSync, targetFile, syncedWav);
        console.log('✅ Synchronized audio generated.');
    } catch (e) {
        console.error('❌ Synchronization failed:', e);
        process.exit(1);
    }

    // Encode to AC3
    const finalAudio = path.join(outputDir, 'synced_audio.ac3');
    try {
        await encodeAudio(syncedWav, finalAudio, 'ac3', 192);
        console.log('✅ Audio encoded to AC3.');
    } catch (e) {
        console.error('❌ Encoding failed:', e);
        process.exit(1);
    }

    // Final Merge
    const finalOutput = path.join(outputDir, `${outputName}.mkv`);
    console.log(`\nMerging into ${finalOutput}...`);

    // Extract metadata from original source
    let audioMetadata = {
        language: 'und',
        title: 'Synced Audio'
    };

    try {
        const info = await getMkvInfo(sourceFile);
        const track = info.tracks.find(t => t.id === selectedTrackIndex);
        if (track && track.properties) {
            if (track.properties.language) audioMetadata.language = track.properties.language;
            if (track.properties.track_name) audioMetadata.title = track.properties.track_name;
            console.log(`Preserving metadata: Language=${audioMetadata.language}, Title=${audioMetadata.title}`);
        }
    } catch (e) {
        console.warn('Could not fetch metadata from source, using defaults.');
    }

    const inputs = [
        {
            path: finalAudio,
            options: [
                '--sync', '0:0',
                '--language', `0:${audioMetadata.language}`,
                '--track-name', `0:${audioMetadata.title}`,
                '--default-track', '0:yes'
            ]
        },
        {
            path: targetFile,
            options: []
        }
    ];

    try {
        await mergeFiles(finalOutput, inputs);
        console.log('✅ Merge successful!');

        // Clean up temporary files
        console.log('\nCleaning up temporary files...');
        const tempFiles = [
            audioRaw,
            audioClean,
            syncedWav,
            finalAudio
        ];

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
        console.error('❌ Merge failed:', e);
        process.exit(1);
    }
}

function smartSynchronize(sourceFile, referenceFile, outputFile) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'adaptive_sync.py');
        console.log('Running adaptive synchronization...');
        execFile('python', [scriptPath, sourceFile, referenceFile, outputFile], (error, stdout, stderr) => {
            if (error) {
                console.error(stdout);
                reject(error);
            } else {
                console.log(stdout);
                resolve();
            }
        });
    });
}

main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
