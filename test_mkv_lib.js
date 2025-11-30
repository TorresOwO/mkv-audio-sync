const { getMkvInfo, mergeFiles } = require('./lib/mkv');
const path = require('path');

async function test() {
    console.log('Testing lib/mkv.js...');

    // Test 1: Check if mkvmerge is available (using a dummy file or just checking version via runMkvMerge if I exposed it)
    // Since I didn't expose runMkvMerge, I'll try getMkvInfo on a non-existent file and expect error, 
    // or try on an existing file if any.

    // Let's try to get info of a file that exists in root: "5x01.-Vive libre ou morre.mkv"
    const testFile = path.join(__dirname, '5x01.-Vive libre ou morre.mkv');

    try {
        console.log(`Getting info for ${testFile}...`);
        const info = await getMkvInfo(testFile);
        console.log('Success! Info retrieved.');
        console.log('Container type:', info.container.type);
    } catch (e) {
        console.error('Test failed:', e.message);
    }

    // Test 2: MergeFiles (Dry run or just check if function exists)
    if (typeof mergeFiles === 'function') {
        console.log('mergeFiles function exists.');
    }
}

test();
