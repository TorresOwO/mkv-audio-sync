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

def simple_stream_sync(clean_file, reference_file, output_file):
    """
    Simple index-by-index streaming synchronization.
    """
    ANALYSIS_RATE = 8000
    SILENCE_WINDOW = int(0.5 * ANALYSIS_RATE)  # 500ms window to check for silence
    SILENCE_THRESHOLD = 100  # RMS threshold
    STEP_SIZE = int(0.1 * ANALYSIS_RATE)  # Check every 100ms
    
    print("=== Simple Streaming Synchronization ===\n")
    
    # Load audios
    print("Loading Clean audio...")
    clean = get_audio_data(clean_file, ANALYSIS_RATE, target_channels=1)
    
    print("Loading Reference audio...")
    ref = get_audio_data(reference_file, ANALYSIS_RATE, target_channels=1)
    
    print(f"\nClean: {len(clean)/ANALYSIS_RATE:.1f}s")
    print(f"Reference: {len(ref)/ANALYSIS_RATE:.1f}s\n")
    
    # Segments: (start, end, cumulative_delay)
    segments = []
    segment_start = 0
    cumulative_delay = 0
    
    i = 0
    silence_count = 0
    skipped_count = 0
    applied_count = 0
    
    print("Scanning audio index-by-index...\n")
    
    while i < len(clean):
        # Check if current position is silence
        if is_silence_at(clean, i, SILENCE_WINDOW, SILENCE_THRESHOLD):
            # Found silence, find its end
            silence_start = i
            while i < len(clean) and is_silence_at(clean, i, SILENCE_WINDOW, SILENCE_THRESHOLD):
                i += STEP_SIZE
            silence_end = i
            
            silence_duration = (silence_end - silence_start) / ANALYSIS_RATE
            
            # Only process silences >= 0.5 seconds
            if silence_duration >= 0.5:
                silence_count += 1
                
                # Calculate delay AFTER silence
                pos_after_silence = silence_end
                expected_pos_ref = pos_after_silence + cumulative_delay
                
                if pos_after_silence < len(clean) and expected_pos_ref < len(ref):
                    delay, quality, window = calculate_delay_progressive(clean, ref, pos_after_silence, int(expected_pos_ref), ANALYSIS_RATE)
                    
                    # Apply if quality is decent (lowered threshold)
                    if quality >= 0.25 and abs(delay) >= ANALYSIS_RATE * 0.05:
                        # Delay is changing! Save segment before silence and update cumulative
                        applied_count += 1
                        
                        print(f"\n=== Silence #{silence_count} at {silence_start/ANALYSIS_RATE:.2f}s - {silence_end/ANALYSIS_RATE:.2f}s (duration: {silence_duration:.2f}s) ===")
                        print(f"  Delay: {delay/ANALYSIS_RATE:.3f}s (quality: {quality:.3f}, window: {window}s)")
                        
                        if silence_start > segment_start:
                            segments.append((segment_start, silence_start, cumulative_delay))
                            print(f"  Segment saved: {segment_start/ANALYSIS_RATE:.2f}s - {silence_start/ANALYSIS_RATE:.2f}s")
                        
                        cumulative_delay += delay
                        segment_start = silence_end
                        print(f"  APPLIED -> Cumulative delay: {cumulative_delay/ANALYSIS_RATE:.3f}s")
                    else:
                        # Delay not changing, don't create new segment
                        skipped_count += 1
        
        i += STEP_SIZE
    
    # Final segment
    if segment_start < len(clean):
        segments.append((segment_start, len(clean), cumulative_delay))
        print(f"\nFinal segment: {segment_start/ANALYSIS_RATE:.2f}s - {len(clean)/ANALYSIS_RATE:.2f}s, delay: {cumulative_delay/ANALYSIS_RATE:.3f}s")
    
    print(f"\n{'='*60}")
    print(f"SUMMARY:")
    print(f"  Total silences found: {silence_count}")
    print(f"  Delays applied: {applied_count}")
    print(f"  Delays skipped: {skipped_count}")
    print(f"  Final segments: {len(segments)}")
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
    
    simple_stream_sync(clean_file, reference_file, output_file)
