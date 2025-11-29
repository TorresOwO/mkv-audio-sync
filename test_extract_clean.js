const { extractAudioTrack, cleanAudio, getMediaInfo } = require('./lib/ffmpeg');
const path = require('path');

/**
 * Script de prueba para extraer y limpiar audio de un MKV
 * Flujo completo:
 * 1. Extraer audio del MKV (con mkvextract o ffmpeg)
 * 2. Limpiar y reparar timestamps
 */
async function testExtractAndClean() {
    try {
        // Archivos de entrada/salida
        const inputMKV = '5x01.-Vive libre ou morre.mkv';
        const trackIndex = 3; // Índice de la pista de audio (ajustar según tu archivo)
        const audioRaw = path.join('output', 'gallego_extraido.ac3');
        const audioClean = path.join('output', 'gallego_clean.ac3');

        console.log('🔍 Obteniendo información del archivo...');
        const info = await getMediaInfo(inputMKV);

        console.log('\n📊 Información del archivo:');
        console.log(`   Archivo: ${info.file}`);
        console.log(`   Duración: ${info.duration}`);
        console.log(`   FPS: ${info.fps}`);
        console.log(`   Pistas de audio encontradas: ${info.audioTracks.length}`);

        info.audioTracks.forEach((track, idx) => {
            console.log(`   [${track.index}] ${track.lang} - ${track.details}`);
        });

        console.log(`\n📝 Proceso:`)
        console.log(`   1. Extraer track ${trackIndex} -> ${audioRaw}`);
        console.log(`   2. Limpiar timestamps -> ${audioClean}`);
        console.log('');

        // Paso 1: Extraer audio del MKV
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('PASO 1: Extracción de audio');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        await extractAudioTrack(inputMKV, trackIndex, audioRaw);

        // Paso 2: Limpiar y reparar timestamps
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('PASO 2: Limpieza de audio');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        await cleanAudio(audioRaw, audioClean, 192);

        console.log('\n✨ Proceso completado exitosamente!');
        console.log(`📁 Audio listo para usar: ${audioClean}`);

    } catch (error) {
        console.error('\n❌ Error:', error.error ? error.error.message : error);
        if (error.stderr) {
            console.error('Detalles:', error.stderr);
        }
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testExtractAndClean();
}

module.exports = { testExtractAndClean };
