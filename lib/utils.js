const fs = require('fs');
const path = require('path');

function getMkvFiles(dir) {
    try {
        return fs.readdirSync(dir)
            .filter(file => file.toLowerCase().endsWith('.mkv'))
            .map(file => path.join(dir, file));
    } catch (e) {
        return [];
    }
}

module.exports = {
    getMkvFiles
};
