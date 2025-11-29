# 🎯 Actualización: Nuevo flujo de extracción y limpieza de audio

## 📌 Resumen de cambios

Se ha integrado un nuevo flujo de trabajo para mejorar la calidad y sincronización del audio extraído.

## ✨ Funcionalidades añadidas

### 1. **Extracción de audio** (`extractAudioTrack`)
- ✅ Intenta usar `mkvextract` primero (nativo para MKV, más eficiente)
- ✅ Fallback automático a `ffmpeg` si mkvextract no está disponible
- ✅ Extrae solo la pista seleccionada sin recodificar

### 2. **Limpieza de audio** (`cleanAudio`)
- 🔧 Genera timestamps PTS correctos con `-fflags +genpts`
- 🎚️ Resamplea con corrección asíncrona (`aresample=async=1:first_pts=0`)
- 🎵 Re-codifica a AC3 @ 192kbps para compatibilidad

## 📂 Archivos modificados

### `lib/ffmpeg.js`
- ➕ Función `extractAudioTrack(inputFile, trackIndex, outputFile)`
- ➕ Función `extractWithFFmpeg()` (helper para fallback)
- ➕ Función `cleanAudio(inputAudio, outputAudio, bitrate = 192)`

### `cli.js`
- ➕ Importa `extractAudioTrack` y `cleanAudio`
- ➕ Añade paso de extracción después de conversión FPS
- ➕ Añade paso de limpieza de audio antes del cálculo de offset
- ✨ Manejo de errores con fallback al archivo original

### `README.md`
- 📝 Actualizado con diagrama de flujo completo
- 📝 Documentación de las nuevas funciones
- 📝 Detalles técnicos de cada paso

### `INSTALL_MKVEXTRACT.md` (NUEVO)
- 📖 Guía de instalación de MKVToolNix en Windows
- 📖 Múltiples métodos de instalación
- 📖 Solución de problemas comunes

### `test_extract_clean.js` (NUEVO)
- 🧪 Script de prueba para el flujo de extracción y limpieza
- 🧪 Muestra información detallada del archivo MKV
- 🧪 Útil para probar el proceso independientemente

## 🔄 Nuevo flujo de trabajo integrado

```
┌──────────────────────────┐
│  Seleccionar archivos    │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│   Detectar FPS           │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ Convertir FPS (si nec.)  │  ← Ya existía
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ **Extraer audio** 🆕     │  ← NUEVO
│ (mkvextract o ffmpeg)    │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ **Limpiar audio** 🆕     │  ← NUEVO
│ (reparar timestamps)     │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ Calcular offset          │  ← Ya existía
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ Fusionar todo            │  ← Ya existía
└──────────────────────────┘
```

## 🚀 Cómo usar

### Flujo completo (CLI interactivo)
```bash
node cli.js
```

El CLI ahora automáticamente:
1. Convierte FPS si es necesario
2. **Extrae el audio** de la pista seleccionada
3. **Limpia y repara timestamps** del audio
4. Calcula el offset de sincronización
5. Fusiona todo en el archivo final

### Probar solo extracción y limpieza
```bash
node test_extract_clean.js
```

### Usar funciones programáticamente
```javascript
const { extractAudioTrack, cleanAudio } = require('./lib/ffmpeg');

// Extraer audio
await extractAudioTrack('video.mkv', 3, 'audio.ac3');

// Limpiar audio
await cleanAudio('audio.ac3', 'audio_clean.ac3', 192);
```

## ⚙️ Instalación opcional de mkvextract

Para mejor rendimiento en la extracción de audio:

1. Descarga MKVToolNix: https://mkvtoolnix.download/downloads.html
2. Instala siguiendo las instrucciones en `INSTALL_MKVEXTRACT.md`
3. Verifica: `mkvextract --version`

**Nota**: Si no instalas mkvextract, el sistema usará ffmpeg automáticamente.

## 🎯 Beneficios del nuevo flujo

### ✅ Mejor calidad de sincronización
- Los timestamps limpios evitan desincronizaciones progresivas
- La corrección PTS elimina problemas de presentación

### ✅ Mayor compatibilidad
- Re-codificación a AC3 garantiza compatibilidad con reproductores
- Bitrate controlado optimiza tamaño vs calidad

### ✅ Más robusto
- Fallback automático si mkvextract no está disponible
- Manejo de errores con continuación del flujo

### ✅ Más rápido (con mkvextract)
- Extracción nativa sin recodificación innecesaria
- Mejor manejo del formato Matroska

## 📝 Comandos equivalentes

### Lo que hace el CLI ahora:
```bash
# 1. Convertir FPS (si es necesario)
ffmpeg -i source.mkv -filter_complex "[0:v]setpts=25/23.976*PTS[v];[0:a]asetrate=48000*(23.976/25),aresample=48000[a]" -map "[v]" -map "[a]" converted.mkv

# 2. Extraer audio (con mkvextract o ffmpeg)
mkvextract tracks converted.mkv 3:audio_raw.ac3
# O fallback:
ffmpeg -i converted.mkv -map 0:3 -c copy audio_raw.ac3

# 3. Limpiar audio
ffmpeg -fflags +genpts -i audio_raw.ac3 -af aresample=async=1:first_pts=0 -c:a ac3 -b:a 192k audio_clean.ac3

# 4. Calcular offset
python calculate_offset.py audio_clean.ac3 target.mkv

# 5. Merge final
ffmpeg -itsoffset DELAY -i audio_clean.ac3 -i target.mkv -map 1:v -map 0:a -map 1:a -c copy output.mkv
```

## 🐛 Solución de problemas

### "mkvextract no se reconoce como comando"
- Es normal si no lo has instalado
- El sistema usará ffmpeg automáticamente
- Si quieres instalarlo, sigue `INSTALL_MKVEXTRACT.md`

### Error en extracción/limpieza
- El CLI continuará con el archivo original
- Verifica que el índice de pista sea correcto
- Revisa que haya espacio en disco suficiente

### Audio desincronizado después del proceso
- Asegúrate de que la conversión FPS se completó correctamente
- Verifica que el offset calculado sea razonable (-2 a +2 segundos)
- Prueba con diferentes pistas de audio si hay múltiples

---

**Desarrollado para mejorar la sincronización de doblajes en gallego** 🎬✨
