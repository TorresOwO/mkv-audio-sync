# 🎬 MKV Audio Sync

**Herramienta para sincronizar audio de archivos MKV de forma automática y sencilla.**

Esta aplicación permite tomar el audio de un archivo de video (por ejemplo, una versión antigua o de TV) y sincronizarlo perfectamente con una versión de mejor calidad (por ejemplo, un Blu-ray), incluso si tienen diferentes velocidades (FPS).

---

## 👤 Para Usuarios (Sin conocimientos técnicos)

### 📥 Descarga e Instalación

1.  Busca la carpeta `dist/win-unpacked` en el directorio del proyecto.
2.  Ejecuta el archivo **`MKV Audio Sync.exe`**.
    *   *No necesitas instalar nada más si usas el ejecutable.*

### 🚀 Cómo usarlo

1.  **Abrir la aplicación**: Verás una ventana oscura con un diseño sencillo.
2.  **Seleccionar Fuente (Source)**:
    *   Haz clic en "Browse" o usa el menú desplegable.
    *   Elige el archivo que tiene el **audio** que quieres usar (ej: `video_gallego.mkv`).
3.  **Seleccionar Pista**:
    *   Si el archivo tiene varios audios, aparecerá un menú para elegir cuál quieres.
4.  **Seleccionar Destino (Target)**:
    *   Elige el archivo de **video** de alta calidad donde quieres poner el audio.
5.  **Sincronizar**:
    *   Haz clic en **"Start Synchronization"**.
    *   Espera a que termine. Verás el progreso en la parte inferior.
6.  **Resultado**:
    *   El nuevo archivo se guardará en la carpeta `output` con el audio sincronizado.

---

## 💻 Para Desarrolladores (Conocimientos técnicos)

Si quieres modificar el código, compilarlo tú mismo o usar la versión de línea de comandos.

### 📋 Requisitos Previos

*   **Node.js** v14+
*   **Python** 3.8+ con `numpy` (`pip install numpy`)
*   **MKVToolNix** (opcional, pero recomendado para `mkvextract`)

### 🛠️ Instalación y Desarrollo

1.  **Clonar y configurar**:
    ```bash
    git clone <repo-url>
    cd mkv-audio-sync
    npm install
    ```

2.  **Ejecutar GUI en modo desarrollo**:
    ```bash
    npm run start-gui
    # Si tienes problemas con PowerShell: npm.cmd run start-gui
    ```

3.  **Ejecutar CLI (Modo clásico)**:
    ```bash
    node cli.js
    ```

4.  **Compilar ejecutable (.exe)**:
    ```bash
    npm run build
    # El resultado estará en dist/win-unpacked/
    ```

### 🏗️ Arquitectura

El proyecto usa una arquitectura híbrida:
*   **Frontend**: Electron (HTML/CSS/JS) para la interfaz.
*   **Backend**: Node.js para la orquestación y manejo de archivos.
*   **Procesamiento**:
    *   `ffmpeg-static`: Para conversión de video/audio y extracción.
    *   `Python + numpy`: Para el cálculo matemático preciso del offset (correlación cruzada).

---

## ⚙️ Cómo funciona (Detalles Técnicos)

El proceso de sincronización sigue estos pasos automáticos:

```mermaid
graph TD
    A[Inicio] --> B{¿FPS Diferentes?}
    B -- Sí --> C[Convertir FPS Video/Audio]
    B -- No --> D[Extraer Audio]
    C --> D
    D --> E[Limpiar y Normalizar Audio]
    E --> F[Calcular Offset (Python FFT)]
    F --> G[Fusionar (Merge)]
    G --> H[Archivo Final]
```

1.  **Detección de FPS**: Analiza si el video fuente (ej. 25fps PAL) y destino (ej. 23.976fps NTSC) tienen diferente velocidad.
2.  **Conversión**: Si es necesario, convierte el audio y video para que coincidan en duración.
3.  **Extracción**: Saca el audio del contenedor MKV.
4.  **Cálculo de Offset**: Usa un script de Python (`adaptive_sync.py`) que compara las formas de onda de ambos audios para encontrar el punto exacto de sincronización.
5.  **Fusión**: Crea un nuevo MKV con el video de alta calidad y el audio sincronizado.

## 📁 Estructura

*   `main.js`: Proceso principal de Electron.
*   `renderer.js`: Lógica de la interfaz de usuario.
*   `lib/`: Módulos de utilidad (ffmpeg, mkv, utils).
*   `adaptive_sync.py`: Algoritmo Core de sincronización.
