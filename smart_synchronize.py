import subprocess
import numpy as np
import os
import sys
import json
import re

def get_ffmpeg_path():
    """
    Locates ffmpeg executable.
    """
    # Try local node_modules first
    ffmpeg_path = os.path.join(os.getcwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if os.path.exists(ffmpeg_path):
        return ffmpeg_path
    
    # Fallback to system command
    return 'ffmpeg'

def get_audio_info(file_path):
    """
    Returns (channels, sample_rate) using ffmpeg/ffprobe logic.
    """
    ffmpeg_path = get_ffmpeg_path()
    command = [ffmpeg_path, '-i', file_path]
    
    process = subprocess.Popen(command, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
    _, stderr = process.communicate()
    stderr_str = stderr.decode('utf-8', errors='ignore')
    
    # Search for Stream #0:x: Audio: ...
    match = re.search(r'Stream #\d+:\d+(?:\[0x[0-9a-f]+\])?(?:\([a-z]+\))?: Audio:.*?, (\d+) Hz, (mono|stereo|(\d+) channels)', stderr_str)
    
    channels = 2 # Default
    sample_rate = 48000 # Default
    
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
    """
    Extracts audio data from a file using ffmpeg.
    Returns a numpy array of samples.
    """
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
            raise Exception("No audio data extracted. Check if file has audio.")

        # Convert raw bytes to numpy array
        audio_data = np.frombuffer(raw_data, dtype=np.int16)
        
        if target_channels and target_channels > 1:
            # Reshape to (samples, channels)
            num_samples = len(audio_data) // target_channels
            audio_data = audio_data[:num_samples*target_channels] 
            audio_data = audio_data.reshape((num_samples, target_channels))
            
        return audio_data
    except Exception as e:
        print(f"Error extracting audio: {e}")
        sys.exit(1)

def calculate_rms_db(audio_data):
    """
    Calculates RMS (Root Mean Square) and converts to dB.
    Returns dB value (can be negative).
    """
    rms = np.sqrt(np.mean(audio_data.astype(np.float32)**2))
    if rms < 1e-10:  # Avoid log(0)
        return -100.0
    # Reference: int16 max = 32768
    db = 20 * np.log10(rms / 32768.0)
    return db

def find_silence_intervals(audio_data, sample_rate, silence_thresh_db=-40, min_duration_sec=0.5, merge_gap_sec=0.2):
    """
    Finds intervals of SILENCE in the audio data using dB threshold.
    Returns a list of (start_sample, end_sample, duration) tuples.
    
    Parameters:
    - silence_thresh_db: Threshold in dB below which is considered silence (default: -40 dB)
    - min_duration_sec: Minimum silence duration to consider (default: 0.5s)
    - merge_gap_sec: Merge silences separated by less than this (default: 0.2s)
    """
    print(f"Detecting silence intervals (threshold: {silence_thresh_db} dB, min duration: {min_duration_sec}s)...")
    
    # Calculate envelope using RMS over small windows
    window_size = int(0.05 * sample_rate)  # 50ms windows
    if window_size < 1:
        window_size = 1
    
    # Calculate RMS for each window
    audio_float = audio_data.astype(np.float32)
    rms_values = []
    
    for i in range(0, len(audio_float), window_size // 2):  # 50% overlap
        window = audio_float[i:i+window_size]
        if len(window) > 0:
            rms = np.sqrt(np.mean(window**2))
            rms_values.append(rms)
    
    rms_array = np.array(rms_values)
    
    # Convert to dB
    rms_array = np.maximum(rms_array, 1e-10)  # Avoid log(0)
    db_array = 20 * np.log10(rms_array / 32768.0)
    
    # Find silence regions
    is_silent = db_array < silence_thresh_db
    
    # Convert back to sample indices
    is_silent_padded = np.concatenate(([False], is_silent, [False]))
    diff = np.diff(is_silent_padded.astype(int))
    
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    
    # Convert window indices to sample indices
    intervals = []
    for start_idx, end_idx in zip(starts, ends):
        start_sample = start_idx * (window_size // 2)
        end_sample = end_idx * (window_size // 2)
        duration_samples = end_sample - start_sample
        
        if duration_samples >= min_duration_sec * sample_rate:
            intervals.append((start_sample, end_sample, duration_samples))
    
    # Merge close silences
    if len(intervals) > 0:
        merged = []
        current_start, current_end, _ = intervals[0]
        
        for i in range(1, len(intervals)):
            next_start, next_end, _ = intervals[i]
            
            if next_start - current_end < merge_gap_sec * sample_rate:
                # Merge
                current_end = next_end
            else:
                # Save current and start new
                merged.append((current_start, current_end, current_end - current_start))
                current_start, current_end = next_start, next_end
        
        # Add last one
        merged.append((current_start, current_end, current_end - current_start))
        intervals = merged
        
    return intervals

def get_top_n_longest_silences(silence_intervals, n=10, min_duration_sec=0.5, sample_rate=8000):
    """
    Returns the top N longest silence intervals sorted by start position.
    Only considers silences with duration >= min_duration_sec.
    """
    if len(silence_intervals) == 0:
        return []
    
    # Filter by minimum duration
    min_duration_samples = int(min_duration_sec * sample_rate)
    filtered = [s for s in silence_intervals if s[2] >= min_duration_samples]
    
    print(f"  Filtered to {len(filtered)} silences >= {min_duration_sec}s")
    
    if len(filtered) == 0:
        return []
    
    # Sort by duration (descending)
    sorted_intervals = sorted(filtered, key=lambda x: x[2], reverse=True)
    
    # Take top N
    top_n = sorted_intervals[:min(n, len(sorted_intervals))]
    
    # Sort by start position for sequential processing
    top_n.sort(key=lambda x: x[0])
    
    return top_n

def create_segments_from_silences(audio_length, silence_intervals):
    """
    Creates non-silent segments between silence intervals.
    Returns list of (start_sample, end_sample) for audio segments.
    """
    if len(silence_intervals) == 0:
        return [(0, audio_length)]
    
    segments = []
    current_pos = 0
    
    for silence_start, silence_end, _ in silence_intervals:
        # Add segment before this silence
        if current_pos < silence_start:
            segments.append((current_pos, silence_start))
        current_pos = silence_end
    
    # Add final segment after last silence
    if current_pos < audio_length:
        segments.append((current_pos, audio_length))
    
    return segments

def find_best_match(needle, haystack, search_start=None, search_end=None):
    """
    Finds the best match of 'needle' (Source segment) in 'haystack' (Reference audio).
    Optionally limits search to a window [search_start, search_end] in haystack.
    Returns (start_index, quality_score).
    
    Quality score is normalized correlation value (0-1), where 1 is perfect match.
    """
    n_needle = len(needle)
    n_haystack = len(haystack)
    
    if n_needle > n_haystack:
        return -1, 0.0
    
    # Apply search window if specified
    if search_start is not None and search_end is not None:
        search_start = max(0, search_start)
        search_end = min(n_haystack, search_end)
        
        if search_start >= search_end or search_end - search_start < n_needle:
            # Window too small
            return -1, 0.0
            
        # Extract search window
        haystack_window = haystack[search_start:search_end]
        offset = search_start
    else:
        haystack_window = haystack
        offset = 0
        
    # Normalize
    needle = needle.astype(np.float32)
    haystack_window = haystack_window.astype(np.float32)
    
    needle -= np.mean(needle)
    haystack_window -= np.mean(haystack_window)
    
    std_needle = np.std(needle)
    std_haystack = np.std(haystack_window)
    
    if std_needle == 0 or std_haystack == 0:
        return -1, 0.0
    
    # Normalize to unit variance for proper correlation
    needle = needle / std_needle
    haystack_window = haystack_window / std_haystack
        
    # FFT Correlation
    n_fft = 1 << (len(haystack_window) + n_needle - 1).bit_length()
    
    fft_needle = np.fft.rfft(np.flip(needle), n=n_fft)
    fft_haystack = np.fft.rfft(haystack_window, n=n_fft)
    
    correlation = np.fft.irfft(fft_needle * fft_haystack)
    
    peak_idx = np.argmax(correlation)
    peak_value = correlation[peak_idx]
    
    # Normalize correlation to 0-1 range
    # Maximum possible correlation is n_needle (when perfectly aligned)
    quality = peak_value / n_needle
    quality = np.clip(quality, 0.0, 1.0)
    
    start_idx = peak_idx - (n_needle - 1)
    
    # Add offset to get position in original haystack
    return start_idx + offset, quality

def save_wav(audio_data, sample_rate, channels, output_path):
    """
    Saves audio data to a WAV file using ffmpeg.
    """
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
    except Exception as e:
        print(f"Error saving WAV: {e}")

def smart_synchronize(source_file, reference_file, output_file, num_splits=10):
    ANALYSIS_RATE = 8000
    
    print(f"Loading Source audio for analysis: {source_file}")
    src_audio_mono = get_audio_data(source_file, ANALYSIS_RATE, target_channels=1)
    
    print(f"Loading Reference audio for analysis: {reference_file}")
    ref_audio_mono = get_audio_data(reference_file, ANALYSIS_RATE, target_channels=1)
    
    # Find ALL silence intervals in source
    silence_intervals = find_silence_intervals(src_audio_mono, ANALYSIS_RATE)
    print(f"Found {len(silence_intervals)} total silence intervals in Source.")
    
    # Get top N longest silences (minimum 1 second duration)
    top_silences = get_top_n_longest_silences(silence_intervals, num_splits, min_duration_sec=1.0, sample_rate=ANALYSIS_RATE)
    print(f"Using top {len(top_silences)} longest silences as split points:")
    for i, (start, end, duration) in enumerate(top_silences):
        print(f"  Silence {i+1}: {start/ANALYSIS_RATE:.2f}s - {end/ANALYSIS_RATE:.2f}s (Duration: {duration/ANALYSIS_RATE:.2f}s)")
    
    # Create segments between silences
    intervals = create_segments_from_silences(len(src_audio_mono), top_silences)
    print(f"Created {len(intervals)} audio segments to sync.")
    
    # Get source info for HQ reconstruction
    src_channels, src_rate = get_audio_info(source_file)
    print(f"Source Audio Info: {src_rate}Hz, {src_channels} channels")
    
    print("Extracting full quality Source for reconstruction...")
    src_audio_hq = get_audio_data(source_file, src_rate, src_channels)
    
    # Calculate incremental delays for each segment
    segment_delays = []
    cumulative_delay = 0  # Track cumulative delay in samples
    
    for i, (start, end) in enumerate(intervals):
        segment_len = end - start
        if segment_len < ANALYSIS_RATE * 1.0:  # Skip segments < 1 second
            segment_delays.append((start, end, cumulative_delay))
            continue
            
        print(f"\nAnalyzing segment {i+1}/{len(intervals)}: {start/ANALYSIS_RATE:.2f}s - {end/ANALYSIS_RATE:.2f}s (Duration: {segment_len/ANALYSIS_RATE:.2f}s)")
        
        src_segment = src_audio_mono[start:end]
        
        # Check if segment has sufficient audio level
        src_db = calculate_rms_db(src_segment)
        print(f"  Source RMS: {src_db:.1f} dB")
        
        # Calculate where this segment SHOULD be in reference
        expected_pos = start + cumulative_delay
        
        # Extract corresponding segment from reference for volume check
        ref_start = int(max(0, expected_pos))
        ref_end = int(min(len(ref_audio_mono), expected_pos + segment_len))
        ref_segment_check = ref_audio_mono[ref_start:ref_end]
        ref_db = calculate_rms_db(ref_segment_check)
        print(f"  Reference RMS: {ref_db:.1f} dB")
        
        # CONSERVATIVE CHECK 1: Skip if both are too quiet (< -35 dB)
        if src_db < -35 and ref_db < -35:
            print(f"  SKIP: Both segments too quiet (< -35 dB), keeping global offset")
            segment_delays.append((start, end, cumulative_delay))
            continue
        
        # Find this source segment in the Reference audio
        # Tight window around expected position
        margin = int(ANALYSIS_RATE * 0.2)
        search_window_start = int(expected_pos - margin)
        search_window_end = int(expected_pos + segment_len + int(ANALYSIS_RATE * 0.5))
        
        print(f"  Expected at {expected_pos/ANALYSIS_RATE:.2f}s")
        print(f"  Search window: {search_window_start/ANALYSIS_RATE:.2f}s - {search_window_end/ANALYSIS_RATE:.2f}s")
        
        match_idx, quality = find_best_match(src_segment, ref_audio_mono, search_window_start, search_window_end)
        
        print(f"  Correlation quality: {quality:.3f}")
        
        if match_idx == -1:
            print(f"  SKIP: Could not find match in search window, keeping global offset")
            segment_delays.append((start, end, cumulative_delay))
            continue
        
        # CONSERVATIVE CHECK 2: Require high correlation quality (>= 0.5)
        if quality < 0.5:
            print(f"  SKIP: Correlation quality too low (< 0.5), keeping global offset")
            segment_delays.append((start, end, cumulative_delay))
            continue
        
        # Calculate incremental delay
        incremental_delay = match_idx - expected_pos
        
        # CONSERVATIVE CHECK 3: Limit local offset to ±0.3s from expected
        if abs(incremental_delay) > ANALYSIS_RATE * 0.3:
            print(f"  SKIP: Offset too far from expected ({incremental_delay/ANALYSIS_RATE:.2f}s > 0.3s), keeping global offset")
            segment_delays.append((start, end, cumulative_delay))
            continue
        
        # Calculate incremental delay for this segment
        # This is how much MORE we need to shift relative to expected position
        incremental_delay = match_idx - expected_pos
        
        # Cap incremental delay to reasonable bounds (max 2 seconds)
        max_delay = ANALYSIS_RATE * 2.0  # 2 seconds
        if abs(incremental_delay) > max_delay:
            print(f"  WARNING: Delay too large ({incremental_delay/ANALYSIS_RATE:.2f}s), capping to {max_delay/ANALYSIS_RATE:.1f}s")
            incremental_delay = max_delay if incremental_delay > 0 else -max_delay
        
        # Smoothing: if this delay corrects the previous one, use an intermediate value
        # Check if we have at least 2 segments and if this delay has opposite sign to the previous
        if len(segment_delays) >= 2:
            # Get the last incremental delay (difference between last two cumulative delays)
            last_cumulative = segment_delays[-1][2]
            prev_cumulative = segment_delays[-2][2] if len(segment_delays) >= 2 else 0
            last_incremental = last_cumulative - prev_cumulative
            
            # If signs are opposite and significant, average them
            if (last_incremental * incremental_delay < 0 and  # Opposite signs
                abs(last_incremental) > ANALYSIS_RATE * 0.3 and  # Last was significant (>0.3s)
                abs(incremental_delay) > ANALYSIS_RATE * 0.3):  # Current is significant (>0.3s)
                
                original_delay = incremental_delay
                incremental_delay = (last_incremental + incremental_delay) / 2
                
                # Also need to correct the cumulative delay
                # Remove the last_incremental and add the smoothed value
                cumulative_delay = prev_cumulative + incremental_delay
                
                print(f"  SMOOTHING: Corrective delay detected, averaging {last_incremental/ANALYSIS_RATE:.3f}s and {original_delay/ANALYSIS_RATE:.3f}s -> {incremental_delay/ANALYSIS_RATE:.3f}s")
                print(f"  SMOOTHING: Adjusted cumulative from {last_cumulative/ANALYSIS_RATE:.3f}s to {cumulative_delay/ANALYSIS_RATE:.3f}s")
            else:
                # Update cumulative delay normally
                cumulative_delay += incremental_delay
        else:
            # Update cumulative delay normally
            cumulative_delay += incremental_delay
        
        delay_seconds = cumulative_delay / ANALYSIS_RATE
        incremental_seconds = incremental_delay / ANALYSIS_RATE
        print(f"  Found at {match_idx/ANALYSIS_RATE:.2f}s in Reference.")
        print(f"  Incremental delay: {incremental_seconds:.3f}s, Cumulative: {delay_seconds:.3f}s")
        
        segment_delays.append((start, end, cumulative_delay))
    
    # Reconstruct the output audio
    # Output should be roughly Source length + cumulative delays
    src_duration = len(src_audio_mono) / ANALYSIS_RATE
    final_delay = cumulative_delay / ANALYSIS_RATE
    output_duration = src_duration + final_delay
    
    output_len_hq = int(output_duration * src_rate)
    
    # Ensure we're at least as long as reference if needed
    ref_duration = len(ref_audio_mono) / ANALYSIS_RATE
    min_output_len = int(ref_duration * src_rate)
    if output_len_hq < min_output_len:
        output_len_hq = min_output_len
    
    print(f"\nOutput duration: {output_duration:.2f}s (Source: {src_duration:.2f}s + Delay: {final_delay:.2f}s)")
    
    if src_channels > 1:
        output_audio_hq = np.zeros((output_len_hq, src_channels), dtype=np.int16)
    else:
        output_audio_hq = np.zeros(output_len_hq, dtype=np.int16)
    
    print(f"\nReconstructing audio with incremental delays...")
    for i, (start, end, cumulative_delay_samples) in enumerate(segment_delays):
        # Map to HQ indices
        hq_start_src = int(start * (src_rate / ANALYSIS_RATE))
        hq_end_src = int(end * (src_rate / ANALYSIS_RATE))
        hq_len = hq_end_src - hq_start_src
        
        # Apply cumulative delay
        hq_delay = int(cumulative_delay_samples * (src_rate / ANALYSIS_RATE))
        hq_start_dst = hq_start_src + hq_delay
        
        # Bounds check
        src_limit = len(src_audio_hq)
        dst_limit = len(output_audio_hq)
        
        if hq_start_src + hq_len > src_limit:
            hq_len = src_limit - hq_start_src
        
        if hq_start_dst < 0:
            # Negative delay - trim the start
            hq_len += hq_start_dst
            hq_start_src -= hq_start_dst
            hq_start_dst = 0
            
        if hq_start_dst + hq_len > dst_limit:
            hq_len = dst_limit - hq_start_dst
             
        if hq_len > 0:
            print(f"  Segment {i+1}: Copying {hq_len} samples from {hq_start_src} to {hq_start_dst} (delay: {hq_delay} samples)")
            output_audio_hq[hq_start_dst : hq_start_dst + hq_len] = src_audio_hq[hq_start_src : hq_start_src + hq_len]
            
    print(f"\nSaving synchronized audio to {output_file}...")
    save_wav(output_audio_hq, src_rate, src_channels, output_file)
    print("Done.")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python smart_synchronize.py <source_mkv> <reference_mkv> <output_wav> [num_splits]")
        sys.exit(1)
        
    source_file = sys.argv[1]
    reference_file = sys.argv[2]
    output_file = sys.argv[3]
    num_splits = int(sys.argv[4]) if len(sys.argv) > 4 else 10
    
    smart_synchronize(source_file, reference_file, output_file, num_splits)
