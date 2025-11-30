# 🎬 MKV Audio Sync CLI

Herramienta interactiva de línea de comandos para sincronizar y fusionar pistas de audio de archivos MKV con diferente framerate.

## ✨ Características

- 🎯 **Interfaz interactiva**: Selecciona archivos y pistas de audio mediante menús
- 🔄 **Conversión automática de FPS**: Detecta y convierte videos PAL (25fps) a NTSC Film (23.976fps)
- 🎵 **Sincronización precisa**: Calcula el offset exacto mediante correlación cruzada de audio
- 🏷️ **Metadatos completos**: Añade tags de idioma y títulos a las pistas de audio
- ⚡ **Optimizado**: Usa codificación por hardware cuando está disponible

## 📋 Requisitos

### Software necesario

- **Node.js** v14 o superior
- **Python** 3.8 o superior
- **numpy** (librería de Python)
- **MKVToolNix** (debe estar en el PATH del sistema)
  - `mkvmerge`: Para fusionar archivos MKV
  - `mkvextract`: Para extraer pistas de audio

### Instalación de dependencias

#### 1. Instalar Node.js

Descarga desde [nodejs.org](https://nodejs.org/)

#### 2. Instalar Python y numpy

```bash
# Windows (con pip)
pip install numpy

# Linux/Mac
pip3 install numpy
```

#### 3. Instalar dependencias del proyecto

```bash
npm install
```

## 🚀 Uso

### Modo interactivo (CLI)

```bash
node cli.js
```

#### Flujo de trabajo

1. **Seleccionar archivo fuente** (el que contiene el audio en gallego, por ejemplo)
2. **Seleccionar archivo destino** (el que contiene el video final)
3. **Elegir pista de audio** (si el archivo fuente tiene múltiples pistas)
4. **La herramienta automáticamente**:
   - ✅ Detecta diferencias de FPS
   - ✅ Convierte el framerate si es necesario
   - ✅ Calcula el offset de sincronización
   - ✅ Fusiona todo con metadatos correctos

### Modo no-interactivo (Automatización)

Para automatización o scripts, usa `audio_sync.js` con argumentos:

```bash
node audio_sync.js <source_mkv> <audio_track_index> <target_mkv> <output_name>
```

#### Parámetros

- `source_mkv` - Archivo MKV con el audio a sincronizar (ej: `galego.mkv`)
- `audio_track_index` - Índice de la pista de audio del source (usualmente `1`)
- `target_mkv` - Archivo MKV destino para sincronizar (ej: `video_final.mkv`)
- `output_name` - Nombre del archivo de salida sin extensión (ej: `synced_output`)

#### Ejemplo práctico

```bash
node audio_sync.js "5x01.-Vive libre ou morre.mkv" 1 "Breaking_Bad_5x01_Live_Free_Or_Die.mkv" episode_5x01_synced
```

Esto generará `output/episode_5x01_synced.mkv` automáticamente sin prompts interactivos.

### Resultado

El archivo final se guarda en `output/<nombre>.mkv` con:
- 🎥 Video del archivo destino
- 🎵 Audio sincronizado del archivo fuente (como pista por defecto)
- 🎵 Audio original del archivo destino (como pista secundaria)
- 📝 Subtítulos del archivo destino

## 🎯 Ejemplo de uso interactivo

```
=== MKV Audio Sync CLI ===
? Select the Source MKV (Audio provider): 
  > galego.mkv

? Select the Target MKV (Video provider): 
  > video_final.mkv

? Select the audio track:
  > 1: glg - Stream #0:1(glg): Audio: ac3, 48000 Hz, stereo

Analyzing files...
Source FPS: 25
Target FPS: 23.976023976023978

FPS mismatch detected. Conversion required.
? Proceed with FPS conversion (this may take a while)? Yes

Converting source file...
✓ Conversion complete.

Calculating sync offset...
Calculated Offset: -0.9515 seconds

Merging into output/synced_output.mkv...
Applying Delay: 0.9515s
✓ Merge successful!
```

## 📁 Estructura del proyecto

```
mkv-audio-sync/
├── cli.js                  # Aplicación principal
├── calculate_offset.py     # Script de cálculo de offset
├── lib/
│   ├── ffmpeg.js          # Utilidades de FFmpeg
│   └── utils.js           # Funciones auxiliares
│   └── mkv.js             # Utilidades de MKVToolNix
├── inputs/                # Coloca tus archivos MKV aquí
└── output/                # Archivos procesados
```

## 🛠️ Cómo funciona

El CLI realiza los siguientes pasos de forma automática:

### Flujo completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1️⃣ SELECCIÓN DE ARCHIVOS                                   │
│   • Archivo fuente (con audio en gallego)                   │
│   • Archivo destino (video final)                           │
│   • Selección de pista de audio (si hay múltiples)          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2️⃣ DETECCIÓN DE FPS                                        │
│   • Analiza framerate de ambos archivos                     │
│   • Normaliza valores comunes (23.98 → 23.976, etc.)        │
└─────────────────────────────────────────────────────────────┘
                          ↓
            ¿FPS diferentes?
                 /    \
               Sí     No → Salta conversión
                ↓
┌─────────────────────────────────────────────────────────────┐
│ 3️⃣ CONVERSIÓN DE FPS (si es necesario)                     │
│   • Video: Ajusta PTS con setpts                            │
│   • Audio: Resampling con corrección de pitch               │
│   • Muestra barra de progreso animada                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4️⃣ EXTRACCIÓN DE AUDIO                                      │
│   • Intenta usar mkvextract (más rápido)                    │
│   • Fallback a ffmpeg si no está disponible                 │
│   • Extrae solo la pista seleccionada (modo copy)           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5️⃣ LIMPIEZA DE AUDIO                                        │
│   • Genera timestamps PTS correctos (-fflags +genpts)       │
│   • Resamplea con corrección asíncrona                      │
│   • Re-codifica a AC3 @ 192kbps                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6️⃣ CÁLCULO DE OFFSET DE SINCRONIZACIÓN                     │
│   • Extrae audio de ambos archivos (4kHz mono)              │
│   • Correlación cruzada por FFT (Python/numpy)              │
│   • Determina el desfase exacto en segundos                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7️⃣ FUSIÓN FINAL                                            │
│   • Aplica delay calculado al audio                         │
│   • Combina video + audio sincronizado + audio original     │
│   • Preserva subtítulos del archivo destino                 │
│   • Añade metadatos (idioma, títulos, pista por defecto)    │
└─────────────────────────────────────────────────────────────┘
                          ↓
                  ✨ ¡LISTO! ✨
          output/synced_output.mkv
```

### Detalles técnicos

#### 1. Detección de FPS
La herramienta detecta automáticamente el framerate de cada video y normaliza valores comunes:
- `23.98` → `23.976` (NTSC Film)
- `29.97` → `29.970` (NTSC)
- `59.94` → `59.940` (NTSC 60)

#### 2. Conversión de velocidad
Si los framerates difieren, se realiza una conversión completa:
- 📹 **Video**: Ajusta PTS (Presentation Timestamp)
- 🎵 **Audio**: Remuestrea y corrige el pitch

#### 3. Extracción de audio 🆕
Extrae la pista de audio seleccionada:
- Intenta usar `mkvextract` (nativo para MKV, más rápido)
- Si no está disponible, usa `ffmpeg`
- Modo copy, sin recodificación en esta etapa

#### 4. Limpieza de audio 🆕
Repara problemas de timestamps que pueden ocurrir después de la conversión de FPS:
- **Generación de PTS**: Crea timestamps de presentación válidos
- **Resampling asíncrono**: Corrige desincronizaciones acumulativas
- **Re-codificación**: AC3 @ 192kbps para compatibilidad

#### 5. Cálculo de offset
Usa correlación cruzada de FFT para encontrar el desfase exacto:
- Extrae audio de ambos archivos (4kHz mono)
- Calcula la correlación en dominio de frecuencia
- Determina el pico de correlación (delay)

#### 6. Fusión final
Combina todo con los metadatos correctos:
- Video del destino
- Audio sincronizado (con delay aplicado)
- Audio original (pista secundaria)
- Subtítulos preservados

## 🎵 Extracción y limpieza de audio

El proyecto ahora incluye funciones para extraer y limpiar pistas de audio de archivos MKV:

### Extracción de audio (`extractAudioTrack`)

Extrae una pista de audio específica de un archivo MKV:
- 🎯 Intenta usar `mkvextract` primero (si está instalado en el sistema)
- 🔄 Fallback automático a `ffmpeg` si `mkvextract` no está disponible
- ✅ Extrae el audio sin recodificar (copy mode)

### Limpieza de audio (`cleanAudio`)

Repara timestamps y limpia el flujo de audio:
- 🔧 Genera PTS (Presentation Timestamps) correctos con `-fflags +genpts`
- 🎚️ Resamplea con corrección asíncrona (`aresample=async=1:first_pts=0`)
- 🎵 Re-codifica a AC3 con bitrate configurable

### Ejemplo de uso

```javascript
const { extractAudioTrack, cleanAudio } = require('./lib/ffmpeg');

// 1. Extraer audio de track 3
await extractAudioTrack('episodio.mkv', 3, 'gallego_extraido.ac3');

// 2. Limpiar y reparar timestamps
await cleanAudio('gallego_extraido.ac3', 'gallego_clean.ac3', 192);
```

O usar el script de prueba:

```bash
node test_extract_clean.js
```

### ¿Por qué limpiar el audio?

Después de convertir FPS o extraer audio de MKV, los timestamps pueden quedar corruptos o desincronizados. La función `cleanAudio` soluciona:
- ⚠️ Timestamps inválidos o faltantes
- ⚠️ Desincronización acumulativa
- ⚠️ Problemas de PTS/DTS

## 🎓 Scripts auxiliares

Además de la CLI interactiva, el proyecto incluye scripts individuales:

- `cli.js` - Aplicación CLI interactiva principal
- `audio_sync.js` - 🆕 CLI no-interactiva con argumentos (para automatización)
- `test_extract_clean.js` - Prueba extracción y limpieza de audio
- `convert_galego.js` - Convierte un archivo específico
- `calculate_offset.py` - Calcula offset entre dos archivos
- `adaptive_sync.py` - Sincronización adaptativa con detección de silencios
- `merge_final.js` - Fusiona con delay conocido
- `add_metadata.js` - Añade metadatos a un archivo existente

## 📝 Notas

- ⚠️ La conversión de FPS puede tardar varios minutos dependiendo del tamaño del video
- 💾 Asegúrate de tener espacio suficiente en disco (aproximadamente 2-3x el tamaño de los archivos originales)
- 🎬 Los archivos originales nunca se modifican, todo se guarda en `output/`

## 📄 Licencia

ISC

---

Desarrollado para sincronizar doblajes en gallego con videos finales 🎬✨
