const path = require('path');
const fs = require('fs');
const { getMkvInfo, mergeFiles } = require('./lib/mkv');

const inputAudio = path.join(__dirname, 'output', 'galego_converted.mkv');
const inputVideo = path.join(__dirname, 'inputs', 'video_final.mkv');
const originalSource = path.join(__dirname, 'inputs', 'galego.mkv'); // Original source for metadata
const output = path.join(__dirname, 'output', 'final_synced.mkv');

// Offset calculated: -0.9515s (Audio is early)
// Delay needed: +0.9515s (951.5ms)
const delay = 952; // Rounding to nearest ms

async function main() {
    console.log('Starting final merge process with mkvmerge...');

    // Check inputs
    if (!fs.existsSync(inputAudio)) {
        console.error(`Error: Input audio not found at ${inputAudio}`);
        console.log('Please run the conversion step first.');
        return;
    }
    if (!fs.existsSync(inputVideo)) {
        console.error(`Error: Input video not found at ${inputVideo}`);
        return;
    }

    console.log(`Audio Source: ${inputAudio}`);
    console.log(`Video Source: ${inputVideo}`);
    console.log(`Original Source (for metadata): ${originalSource}`);
    console.log(`Delay: ${delay}ms`);
    console.log(`Output: ${output}`);

    let audioMetadata = {
        language: 'gl',
        title: 'Galego'
    };

    // Try to get metadata from original source
    if (fs.existsSync(originalSource)) {
        try {
            console.log('Reading metadata from original source...');
            const info = await getMkvInfo(originalSource);
            // Assuming the first audio track is the one we want
            const audioTrack = info.tracks.find(t => t.type === 'audio');
            if (audioTrack && audioTrack.properties) {
                if (audioTrack.properties.language) audioMetadata.language = audioTrack.properties.language;
                if (audioTrack.properties.track_name) audioMetadata.title = audioTrack.properties.track_name;
                console.log(`Found metadata: Language=${audioMetadata.language}, Title=${audioMetadata.title}`);
            }
        } catch (e) {
            console.warn('Failed to read metadata from original source, using defaults.', e.message);
        }
    } else {
        console.warn('Original source not found, using default metadata.');
    }

    // Construct inputs for mkvmerge
    // We want:
    // 1. Audio from inputAudio (converted) -> Track 0
    // 2. Video from inputVideo -> Track 1
    // 3. Audio from inputVideo -> Track 2
    // 4. Subtitles from inputVideo -> Track 3...

    // mkvmerge logic:
    // -o output
    // --sync 0:delay (apply delay to track 0 of inputAudio)
    // --language 0:lang --track-name 0:title (apply metadata to track 0 of inputAudio)
    // inputAudio
    // inputVideo

    const inputs = [
        {
            path: inputAudio,
            options: [
                '--sync', `0:${delay}`,
                '--language', `0:${audioMetadata.language}`,
                '--track-name', `0:${audioMetadata.title}`,
                '--default-track', '0:yes'
            ]
        },
        {
            path: inputVideo,
            options: [
                // No specific options for video file, just take everything
                // mkvmerge will append tracks after the first file's tracks
            ]
        }
    ];

    try {
        await mergeFiles(output, inputs);
        console.log('Final merge completed successfully!');
    } catch (e) {
        console.error('Error during merge:', e);
    }
}

main();
