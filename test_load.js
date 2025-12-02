
try {
    const ffmpeg = require('./lib/ffmpeg');
    console.log('ffmpeg module loaded:', Object.keys(ffmpeg));

    const mkvmerge = require('./lib/mkvmerge');
    console.log('mkvmerge module loaded:', Object.keys(mkvmerge));

    const cli = require('./cli'); // This might run main() immediately if not careful, but main() is async and called at end.
    // Actually cli.js calls main() at the end: main();
    // So requiring it will run it.
} catch (e) {
    console.error('Error loading modules:', e);
}
