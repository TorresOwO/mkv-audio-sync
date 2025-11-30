const { execFile } = require('child_process');

/**
 * Executes mkvmerge with the given arguments
 * @param {string[]} args - Arguments for mkvmerge
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runMkvMerge(args) {
    return new Promise((resolve, reject) => {
        execFile('mkvmerge', args, (error, stdout, stderr) => {
            if (error) {
                // mkvmerge returns exit code 1 for warnings, 2 for errors
                // We should check stderr/stdout to decide if it's a real failure
                if (error.code === 1) {
                    console.log('mkvmerge finished with warnings.');
                    resolve({ stdout, stderr });
                } else {
                    reject({ error, stderr, stdout });
                }
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

/**
 * Gets MKV file information using mkvmerge -J
 * @param {string} filePath - Path to MKV file
 * @returns {Promise<Object>} - Parsed JSON info
 */
async function getMkvInfo(filePath) {
    try {
        const { stdout } = await runMkvMerge(['-J', filePath]);
        return JSON.parse(stdout);
    } catch (e) {
        throw new Error(`Failed to get MKV info: ${e.message}`);
    }
}

/**
 * Merges files using mkvmerge
 * @param {string} output - Output file path
 * @param {Array<{path: string, options: string[]}>} inputs - List of inputs with their specific options
 * @param {string[]} globalOptions - Global options for mkvmerge
 */
async function mergeFiles(output, inputs, globalOptions = []) {
    const args = ['-o', output, ...globalOptions];

    for (const input of inputs) {
        if (input.options) {
            args.push(...input.options);
        }
        args.push(input.path);
    }

    console.log('Running mkvmerge with args:', args.join(' '));
    return runMkvMerge(args);
}

module.exports = {
    getMkvInfo,
    mergeFiles
};
