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

### Inicio rápido

```bash
node cli.js
```

### Flujo de trabajo

1. **Seleccionar archivo fuente** (el que contiene el audio en gallego, por ejemplo)
2. **Seleccionar archivo destino** (el que contiene el video final)
3. **Elegir pista de audio** (si el archivo fuente tiene múltiples pistas)
4. **La herramienta automáticamente**:
   - ✅ Detecta diferencias de FPS
   - ✅ Convierte el framerate si es necesario
   - ✅ Calcula el offset de sincronización
   - ✅ Fusiona todo con metadatos correctos

### Resultado

El archivo final se guarda en `output/synced_output.mkv` con:
- 🎥 Video del archivo destino
- 🎵 Audio sincronizado del archivo fuente (como pista por defecto)
- 🎵 Audio original del archivo destino (como pista secundaria)
- 📝 Subtítulos del archivo destino

## 🎯 Ejemplo práctico

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
├── inputs/                # Coloca tus archivos MKV aquí
└── output/                # Archivos procesados
```

## 🛠️ Cómo funciona

### 1. Detección de FPS
La herramienta detecta automáticamente el framerate de cada video y normaliza valores comunes:
- `23.98` → `23.976` (NTSC Film)
- `29.97` → `29.970` (NTSC)
- `59.94` → `59.940` (NTSC 60)

### 2. Conversión de velocidad
Si los framerates difieren, se realiza una conversión completa:
- 📹 **Video**: Ajusta PTS (Presentation Timestamp)
- 🎵 **Audio**: Remuestrea y corrige el pitch

### 3. Cálculo de offset
Usa correlación cruzada de FFT para encontrar el desfase exacto:
- Extrae audio de ambos archivos (4kHz mono)
- Calcula la correlación en dominio de frecuencia
- Determina el pico de correlación (delay)

### 4. Fusión final
Combina todo con los metadatos correctos:
- Video del destino
- Audio sincronizado (con delay aplicado)
- Audio original (pista secundaria)
- Subtítulos preservados

## 🎓 Scripts auxiliares

Además de la CLI interactiva, el proyecto incluye scripts individuales:

- `convert_galego.js` - Convierte un archivo específico
- `calculate_offset.py` - Calcula offset entre dos archivos
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
