import subprocess
import numpy as np
import os

def get_audio_data(file_path, sample_rate=4000):
    """
    Extracts audio data from a file using ffmpeg.
    Returns a numpy array of samples.
    """
    # Use the local ffmpeg-static if possible, otherwise rely on system path (or we can pass the path)
    # Since we are in python, let's assume 'ffmpeg' command works or use the absolute path from node_modules if we knew it easily.
    # For now, let's try 'ffmpeg' command, if it fails we might need the path.
    # Actually, the user has ffmpeg-static in node_modules. Let's try to find it.
    
    ffmpeg_path = os.path.join(os.getcwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if not os.path.exists(ffmpeg_path):
        ffmpeg_path = 'ffmpeg' # Fallback

    command = [
        ffmpeg_path,
        '-i', file_path,
        '-f', 's16le',       # Signed 16-bit little endian
        '-ac', '1',          # Mono
        '-ar', str(sample_rate), # Downsample
        '-vn',               # No video
        '-'                  # Output to stdout
    ]

    print(f"Extracting audio from {os.path.basename(file_path)}...")
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=10**8)
    raw_data = process.stdout.read()
    
    # Convert raw bytes to numpy array
    audio_data = np.frombuffer(raw_data, dtype=np.int16)
    return audio_data

def calculate_offset(file1, file2, sample_rate=4000):
    """
    Calculates the offset of file1 relative to file2.
    Positive offset means file1 is ahead (needs delay).
    """
    audio1 = get_audio_data(file1, sample_rate)
    audio2 = get_audio_data(file2, sample_rate)

    print(f"Audio 1 samples: {len(audio1)}")
    print(f"Audio 2 samples: {len(audio2)}")

    # Normalize
    audio1 = audio1.astype(np.float32)
    audio2 = audio2.astype(np.float32)
    audio1 -= np.mean(audio1)
    audio2 -= np.mean(audio2)
    audio1 /= np.std(audio1) + 1e-6
    audio2 /= np.std(audio2) + 1e-6

    print("Computing cross-correlation...")
    # Use fftconvolve for speed if available (scipy), but numpy.correlate is slow for large arrays.
    # numpy.correlate is O(N*M). For 40 mins at 4kHz, N~9.6e6. Too slow.
    # We should use FFT based correlation. numpy doesn't have fftconvolve built-in directly in a convenient way for this without full convolution.
    # Actually, let's use a trick: correlation is convolution of a with reversed b.
    
    # Pad to next power of 2 for speed
    n = len(audio1) + len(audio2) - 1
    n_fft = 1 << (n - 1).bit_length()
    
    # FFT
    print("Performing FFT...")
    fft1 = np.fft.rfft(audio1, n=n_fft)
    fft2 = np.fft.rfft(np.flip(audio2), n=n_fft) # Flip one for correlation
    
    # Convolve (multiply in freq domain)
    correlation = np.fft.irfft(fft1 * fft2)
    
    # Find peak
    peak_idx = np.argmax(correlation)
    
    # The peak index in the result corresponds to the shift.
    # Because we padded and used FFT, we need to interpret the index correctly.
    # The valid correlation result is centered.
    
    # Let's double check the lag calculation.
    # If we use standard correlate(a, b, mode='full'):
    # index 0 corresponds to a shift where b is at the very end of a.
    # The center is at len(b) - 1.
    
    # With FFT method:
    # correlation[k] corresponds to a cyclic shift.
    # We need to handle the wrapping.
    
    if peak_idx > n_fft // 2:
        peak_idx -= n_fft
        
    # Adjustment for the flip and padding
    # The lag is relative to the start of the signals.
    # Let's verify with a small example mentally.
    # If signals are identical, peak should be at lag 0.
    # With flip(audio2), we are doing conv(audio1, audio2_reversed).
    # This equals cross_corr(audio1, audio2).
    # If audio1 matches audio2 exactly, the peak of conv(a, rev(b)) is at len(b)-1.
    
    # Wait, the FFT result index needs to be shifted.
    # Let's use a simpler approach if we are unsure about the FFT index mapping:
    # Just find the peak and map it back.
    # The peak at index `i` in the output of irfft corresponds to a shift.
    # If we strictly follow: conv(a, b) has length len(a)+len(b)-1.
    # Peak at index `k`. Lag = k - (len(b) - 1).
    
    lag_samples = peak_idx - (len(audio2) - 1)
    
    offset_seconds = lag_samples / sample_rate
    return offset_seconds

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python calculate_offset.py <file1> <file2>")
        sys.exit(1)
        
    file1 = sys.argv[1]
    file2 = sys.argv[2]
    
    try:
        offset = calculate_offset(file1, file2)
        print(f"Calculated Offset: {offset:.4f} seconds")
        # Print only the number on the last line for easy parsing if needed, 
        # or just rely on the file output which is safer.
        with open('offset.txt', 'w', encoding='utf-8') as f:
            f.write(f"{offset:.4f}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
