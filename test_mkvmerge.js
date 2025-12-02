const { checkMkvMerge, setMkvMergePath, mergeFilesMkvMerge } = require('./lib/mkvmerge');
const path = require('path');

async function test() {
    console.log('Checking mkvmerge...');
    const found = await checkMkvMerge();
    console.log('Found automatically?', found);

    if (!found) {
        console.log('Testing setMkvMergePath with directory...');
        // Simulate user inputting the directory
        setMkvMergePath('C:\\Program Files\\MKVToolNix');
        // We can't easily check the internal var, but we can try to run a dummy merge or check again if we exposed a getter.
        // But checkMkvMerge uses the internal var if we modify it? 
        // Wait, checkMkvMerge resets it to 'mkvmerge' or common path if found. 
        // But if we call setMkvMergePath, we want to use THAT.

        // My implementation of checkMkvMerge resets mkvmergePath if it finds it.
        // But if it returns false, mkvmergePath remains what it was (default 'mkvmerge' or last set).

        // Let's verify if setMkvMergePath correctly appends .exe
        // I'll inspect the module by requiring it again? No, it's cached.
    }
}

test();
