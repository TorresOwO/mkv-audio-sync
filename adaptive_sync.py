import subprocess
import numpy as np
import os
import sys
import re

def get_ffmpeg_path():
    """Locates ffmpeg executable."""
    ffmpeg_path = os.path.join(os.getcwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if os.path.exists(ffmpeg_path):
        return ffmpeg_path
    return 'ffmpeg'

def get_audio_info(file_path):
    """Returns (channels, sample_rate) using ffmpeg."""
    ffmpeg_path = get_ffmpeg_path()
    command = [ffmpeg_path, '-i', file_path]
    
    process = subprocess.Popen(command, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
    _, stderr = process.communicate()
    stderr_str = stderr.decode('utf-8', errors='ignore')
    
    match = re.search(r'Stream #\d+:\d+(?:\[0x[0-9a-f]+\])?(?:\([a-z]+\))?: Audio:.*?, (\d+) Hz, (mono|stereo|(\d+) channels)', stderr_str)
    
    channels = 2
    sample_rate = 48000
    
    if match:
        sample_rate = int(match.group(1))
        channel_str = match.group(2)
        if channel_str == 'mono':
            channels = 1
        elif channel_str == 'stereo':
            channels = 2
        else:
            channels = int(match.group(3))
            
    return channels, sample_rate

def get_audio_data(file_path, target_sample_rate=None, target_channels=None):
    """Extracts audio data from a file using ffmpeg."""
    ffmpeg_path = get_ffmpeg_path()
    
    args = [ffmpeg_path, '-i', file_path, '-f', 's16le']
    
    if target_sample_rate:
        args.extend(['-ar', str(target_sample_rate)])
        
    if target_channels:
        args.extend(['-ac', str(target_channels)])
        
    args.extend(['-vn', '-'])
    
    print(f"Extracting audio from {os.path.basename(file_path)} (sr={target_sample_rate}, ch={target_channels})...")
    try:
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=10**8)
        raw_data = process.stdout.read()
        
        if not raw_data:
            raise Exception("No audio data extracted.")

        audio_data = np.frombuffer(raw_data, dtype=np.int16)
        
        if target_channels and target_channels > 1:
            num_samples = len(audio_data) // target_channels
            audio_data = audio_data[:num_samples*target_channels] 
            audio_data = audio_data.reshape((num_samples, target_channels))
            
        return audio_data
    except Exception as e:
        print(f"Error extracting audio: {e}")
        sys.exit(1)

def is_silence_at(audio, position, window_samples, threshold=100):
    """
    Checks if audio is silent at given position using RMS over a window.
    """
    end = min(position + window_samples, len(audio))
    segment = audio[position:end]
    
    if len(segment) == 0:
        return False
    
    rms = np.sqrt(np.mean(segment.astype(np.float32)**2))
    return rms < threshold

def calculate_delay_progressive(clean, ref, pos_clean, pos_ref_expected, sample_rate):
    """
    Calculates delay using progressive window sizes.
    Returns (delay_samples, quality, window_used).
    """
    window_sizes = [3, 5, 10, 20, 40]  # seconds
    
    best_delay = 0
    best_quality = 0.0
    best_window = window_sizes[0]
    
    for window_sec in window_sizes:
        window_samples = int(window_sec * sample_rate)
        
        # Extract from clean starting at pos_clean
        clean_seg = clean[pos_clean:pos_clean + window_samples]
        
        # Search in ref around expected position (±1 second)
        search_margin = sample_rate
        ref_start = max(0, pos_ref_expected - search_margin)
        ref_end = min(len(ref), pos_ref_expected + window_samples + search_margin)
        ref_search = ref[ref_start:ref_end]
        
        if len(clean_seg) < sample_rate // 2 or len(ref_search) < sample_rate // 2:
            continue
        
        # Normalize
        clean_norm = clean_seg.astype(np.float32)
        ref_norm = ref_search.astype(np.float32)
        
        clean_norm -= np.mean(clean_norm)
        ref_norm -= np.mean(ref_norm)
        
        std_clean = np.std(clean_norm)
        std_ref = np.std(ref_norm)
        
        if std_clean < 1 or std_ref < 1:
            continue
        
        clean_norm /= std_clean
        ref_norm /= std_ref
        
        # FFT Correlation
        n_fft = 1 << (len(clean_norm) + len(ref_norm) - 1).bit_length()
        
        fft_clean = np.fft.rfft(np.flip(clean_norm), n=n_fft)
        fft_ref = np.fft.rfft(ref_norm, n=n_fft)
        
        correlation = np.fft.irfft(fft_clean * fft_ref)
        
        peak_idx = np.argmax(correlation)
        peak_value = correlation[peak_idx]
        
        quality = peak_value / len(clean_norm)
        quality = np.clip(quality, 0.0, 1.0)
        
        # Calculate delay
        delay = (peak_idx - (len(clean_norm) - 1)) - search_margin
        
        # Update best
        if quality > best_quality:
            best_delay = delay
            best_quality = quality
            best_window = window_sec
        
        # Stop if quality is good with small window
        if quality >= 0.5 and window_sec <= 10:
            break
        
        if quality >= 0.7:
            break
    
    return best_delay, best_quality, best_window

def save_wav(audio_data, sample_rate, channels, output_path):
    """Saves audio data to WAV using ffmpeg."""
    ffmpeg_path = get_ffmpeg_path()
    
    command = [
        ffmpeg_path,
        '-f', 's16le',
        '-ar', str(sample_rate),
        '-ac', str(channels),
        '-i', '-',
        '-y',
        output_path
    ]
    
    try:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        process.communicate(input=audio_data.tobytes())
        print(f"Saved: {output_path}")
    except Exception as e:
        print(f"Error saving WAV: {e}")

def sliding_window_sync(clean_file, reference_file, output_file):
    """
    Continuous synchronization using sliding window cross-correlation.
    Scans the entire audio in steps, calculating delay at each point.
    """
    ANALYSIS_RATE = 8000
    WINDOW_SIZE = 10 * ANALYSIS_RATE  # 10 seconds window
    STEP_SIZE = 2 * ANALYSIS_RATE     # 2 seconds step
    SEARCH_MARGIN = 5 * ANALYSIS_RATE # +/- 5 seconds search
    
    print("=== Continuous Sliding Window Synchronization ===\n")
    
    # Load audios
    print("Loading Clean audio...")
    clean = get_audio_data(clean_file, ANALYSIS_RATE, target_channels=1)
    
    print("Loading Reference audio...")
    ref = get_audio_data(reference_file, ANALYSIS_RATE, target_channels=1)
    
    print(f"\nClean: {len(clean)/ANALYSIS_RATE:.1f}s")
    print(f"Reference: {len(ref)/ANALYSIS_RATE:.1f}s\n")
    
    # 1. Collect delay points
    raw_points = [] # List of (time, delay, quality)
    
    print("Scanning audio with sliding window...")
    
    for i in range(0, len(clean) - WINDOW_SIZE, STEP_SIZE):
        # Extract clean window
        clean_seg = clean[i : i + WINDOW_SIZE]
        
        # Search range: previous delay +/- margin
        # If no previous delay, assume 0
        last_delay = raw_points[-1][1] if raw_points else 0
        
        # Center search on expected position
        expected_ref_pos = i + last_delay
        ref_start = max(0, int(expected_ref_pos - SEARCH_MARGIN))
        ref_end = min(len(ref), int(expected_ref_pos + WINDOW_SIZE + SEARCH_MARGIN))
        
        ref_seg = ref[ref_start : ref_end]
        
        if len(clean_seg) < WINDOW_SIZE or len(ref_seg) < WINDOW_SIZE:
            continue
            
        # Normalize
        clean_norm = clean_seg.astype(np.float32)
        ref_norm = ref_seg.astype(np.float32)
        
        clean_norm -= np.mean(clean_norm)
        ref_norm -= np.mean(ref_norm)
        
        std_clean = np.std(clean_norm)
        std_ref = np.std(ref_norm)
        
        if std_clean < 1 or std_ref < 1:
            continue
            
        clean_norm /= std_clean
        ref_norm /= std_ref
        
        # FFT Correlation
        n_fft = 1 << (len(clean_norm) + len(ref_norm) - 1).bit_length()
        fft_clean = np.fft.rfft(np.flip(clean_norm), n=n_fft)
        fft_ref = np.fft.rfft(ref_norm, n=n_fft)
        correlation = np.fft.irfft(fft_clean * fft_ref)
        
        peak_idx = np.argmax(correlation)
        peak_value = correlation[peak_idx]
        quality = peak_value / len(clean_norm)
        
        shift = peak_idx - (len(clean_norm) - 1)
        ref_match_pos = ref_start + shift
        delay = ref_match_pos - i
        
        # Only accept decent quality matches
        if quality > 0.25:
            raw_points.append((i, delay, quality))
            
        if i % (STEP_SIZE * 10) == 0:
            print(f"  Scanned {i/ANALYSIS_RATE:.1f}s...")

    print(f"\nCollected {len(raw_points)} raw points.")
    
    if not raw_points:
        print("No valid synchronization points found.")
        return

    # 2. Filter and Smooth Delays
    # Apply median filter to remove outliers
    filtered_points = []
    filter_window = 5 # Number of points to consider for median
    
    for k in range(len(raw_points)):
        start_idx = max(0, k - filter_window // 2)
        end_idx = min(len(raw_points), k + filter_window // 2 + 1)
        window_points = raw_points[start_idx:end_idx]
        
        # Get median delay
        delays = [p[1] for p in window_points]
        median_delay = np.median(delays)
        
        filtered_points.append((raw_points[k][0], median_delay))

    # 3. Create Segments
    # Only create a new segment if the delay changes significantly AND stays changed
    segments = []
    current_start = 0
    current_delay = filtered_points[0][1]
    
    print("\nAnalyzing delay transitions (Filtered)...")
    
    for k in range(1, len(filtered_points)):
        time, delay = filtered_points[k]
        
        # Check for significant change (> 100ms)
        if abs(delay - current_delay) > (0.1 * ANALYSIS_RATE):
            # Delay changed. Is it stable?
            # Look ahead to confirm it's not a blip
            is_stable = True
            look_ahead = 3
            if k + look_ahead < len(filtered_points):
                for j in range(1, look_ahead + 1):
                    if abs(filtered_points[k+j][1] - delay) > (0.1 * ANALYSIS_RATE):
                        is_stable = False
                        break
            
            if is_stable:
                # Confirm segment change
                segments.append((current_start, time, current_delay))
                print(f"  Segment: {current_start/ANALYSIS_RATE:.1f}s - {time/ANALYSIS_RATE:.1f}s, Delay: {current_delay/ANALYSIS_RATE:.3f}s")
                
                current_start = time
                current_delay = delay
            
    # Final segment
    segments.append((current_start, len(clean), current_delay))
    print(f"  Segment: {current_start/ANALYSIS_RATE:.1f}s - {len(clean)/ANALYSIS_RATE:.1f}s, Delay: {current_delay/ANALYSIS_RATE:.3f}s")
    
    print(f"\n{'='*60}")
    print(f"SUMMARY:")
    print(f"  Total segments: {len(segments)}")
    print(f"{'='*60}\n")
    
    # Reconstruct
    clean_channels, clean_rate = get_audio_info(clean_file)
    print(f"Loading full quality clean audio ({clean_rate}Hz, {clean_channels}ch)...")
    clean_hq = get_audio_data(clean_file, clean_rate, clean_channels)
    
    final_delay = segments[-1][2] if segments else 0
    output_len = int((len(clean) + final_delay) * (clean_rate / ANALYSIS_RATE))
    
    if clean_channels > 1:
        output = np.zeros((output_len, clean_channels), dtype=np.int16)
    else:
        output = np.zeros(output_len, dtype=np.int16)
    
    print("\nReconstructing...\n")
    
    for idx, (start, end, delay) in enumerate(segments):
        hq_start = int(start * (clean_rate / ANALYSIS_RATE))
        hq_end = int(end * (clean_rate / ANALYSIS_RATE))
        hq_delay = int(delay * (clean_rate / ANALYSIS_RATE))
        
        hq_len = hq_end - hq_start
        dst_start = hq_start + hq_delay
        
        if hq_start + hq_len > len(clean_hq):
            hq_len = len(clean_hq) - hq_start
        
        if dst_start < 0:
            hq_len += dst_start
            hq_start -= dst_start
            dst_start = 0
        
        if dst_start + hq_len > len(output):
            hq_len = len(output) - dst_start
        
        if hq_len > 0:
            output[dst_start:dst_start + hq_len] = clean_hq[hq_start:hq_start + hq_len]
    
    print(f"Saving to {output_file}...")
    save_wav(output, clean_rate, clean_channels, output_file)
    print("Done!\n")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python adaptive_sync.py <clean_audio> <reference_video> <output_wav>")
        sys.exit(1)
    
    clean_file = sys.argv[1]
    reference_file = sys.argv[2]
    output_file = sys.argv[3]
    
    sliding_window_sync(clean_file, reference_file, output_file)
