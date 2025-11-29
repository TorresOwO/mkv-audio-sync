# 🛠️ Instalación de mkvextract en Windows

## ¿Qué es mkvextract?

`mkvextract` es parte de **MKVToolNix**, una suite de herramientas para trabajar con archivos Matroska (.mkv). Es especialmente útil para:
- Extraer pistas de audio/video/subtítulos sin recodificar
- Preservar la calidad original (modo copy)
- Trabajar con el formato MKV de forma nativa

## Instalación

### Opción 1: Instalador de Windows (Recomendado) ✅

1. **Descargar MKVToolNix**
   - Ve a: https://mkvtoolnix.download/downloads.html
   - Descarga la versión para Windows (archivo `.exe`)
   - Ejemplo: `mkvtoolnix-64-bit-79.0.exe`

2. **Instalar**
   - Ejecuta el instalador descargado
   - Sigue las instrucciones (Next, Next, Install)
   - Ubicación por defecto: `C:\Program Files\MKVToolNix`

3. **Verificar instalación**
   ```powershell
   mkvextract --version
   ```
   
   Si muestra la versión, ¡listo! ✅
   
   Si muestra error "comando no encontrado", continúa al siguiente paso.

4. **Agregar al PATH (si es necesario)**
   
   Si el comando anterior falló, necesitas agregar MKVToolNix al PATH:
   
   a. Abre **Panel de Control** → **Sistema** → **Configuración avanzada del sistema**
   
   b. Click en **Variables de entorno**
   
   c. En **Variables del sistema**, busca `Path` y haz doble click
   
   d. Click en **Nuevo** y agrega:
   ```
   C:\Program Files\MKVToolNix
   ```
   
   e. Click **Aceptar** en todas las ventanas
   
   f. **Reinicia la terminal** (cierra PowerShell/CMD y ábrelo de nuevo)
   
   g. Verifica de nuevo:
   ```powershell
   mkvextract --version
   ```

### Opción 2: Chocolatey (Para usuarios avanzados)

Si tienes [Chocolatey](https://chocolatey.org/) instalado:

```powershell
choco install mkvtoolnix
```

### Opción 3: Portable (Sin instalación)

1. Descarga la versión portable desde https://mkvtoolnix.download/downloads.html
2. Extrae el ZIP a una carpeta (ej: `C:\Tools\MKVToolNix`)
3. Agrega esa carpeta al PATH (ver paso 4 de Opción 1)

## Uso con este proyecto

Una vez instalado `mkvextract`, las funciones del proyecto lo detectarán automáticamente:

```javascript
const { extractAudioTrack } = require('./lib/ffmpeg');

// Automáticamente usará mkvextract si está disponible
// Si no, hará fallback a ffmpeg
await extractAudioTrack('video.mkv', 3, 'audio.ac3');
```

### Ventajas de usar mkvextract

✅ **Más rápido**: No recodifica, solo extrae  
✅ **Sin pérdida**: Calidad 100% original  
✅ **Específico para MKV**: Maneja mejor el formato Matroska  
✅ **Preserva metadatos**: Mantiene información de la pista original  

### Si no quieres instalarlo

No hay problema, el proyecto tiene **fallback automático a ffmpeg**:
- Si `mkvextract` está disponible → lo usa
- Si no está disponible → usa `ffmpeg` automáticamente

Ambos métodos funcionan correctamente para extraer audio.

## Verificación

Puedes verificar que todo funciona correctamente ejecutando:

```bash
node test_extract_clean.js
```

Este script:
1. Detecta automáticamente si `mkvextract` está disponible
2. Muestra qué herramienta está usando
3. Extrae y limpia el audio

## Comandos útiles de mkvextract

```bash
# Ver información del MKV
mkvinfo archivo.mkv

# Extraer track 3 a audio.ac3
mkvextract tracks archivo.mkv 3:audio.ac3

# Extraer múltiples tracks
mkvextract tracks archivo.mkv 1:video.h264 2:audio1.ac3 3:audio2.ac3

# Extraer subtítulos
mkvextract tracks archivo.mkv 4:subtitles.srt
```

## Solución de problemas

### "mkvextract no se reconoce como comando"
- Verifica que agregaste correctamente la carpeta al PATH
- Reinicia la terminal después de modificar el PATH
- Si usaste el instalador, la ruta debería ser: `C:\Program Files\MKVToolNix`

### El script usa ffmpeg en lugar de mkvextract
- Normal si `mkvextract` no está en el PATH
- El resultado será el mismo, solo tomará un poco más de tiempo

### Error al extraer audio
- Verifica el índice de la pista con: `node inspect.js` 
- Asegúrate de que el archivo MKV no esté corrupto
- Verifica que tienes espacio en disco suficiente

---

**Nota**: Este proyecto funciona igualmente bien con o sin `mkvextract`. La instalación es opcional pero recomendada para mejor rendimiento. 🚀
