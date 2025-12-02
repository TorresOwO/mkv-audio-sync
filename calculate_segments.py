import subprocess
import numpy as np
import os
import json
import sys

# Fix for Windows console encoding
sys.stdout.reconfigure(encoding='utf-8')

def get_audio_data(file_path, sample_rate=4000):
    """
    Extracts audio data from a file using ffmpeg.
    Returns a numpy array of samples.
    """
    ffmpeg_path = os.path.join(os.getcwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if not os.path.exists(ffmpeg_path):
        ffmpeg_path = 'ffmpeg'

    command = [
        ffmpeg_path,
        '-i', file_path,
        '-f', 's16le',
        '-ac', '1',
        '-ar', str(sample_rate),
        '-vn',
        '-'
    ]

    print(f"Extracting audio from {os.path.basename(file_path)}...")
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=10**8)
    raw_data = process.stdout.read()
    
    audio_data = np.frombuffer(raw_data, dtype=np.int16)
    return audio_data

def find_silence(audio, sample_rate, start_idx, end_idx, silence_threshold_db=-40, min_silence_duration=0.1):
    """
    Find a silence point within the given range.
    Returns the index of the silence midpoint, or None if no silence found.
    """
    if start_idx >= end_idx or start_idx >= len(audio):
        return None
    
    # Convert dB threshold to amplitude
    silence_threshold = 10 ** (silence_threshold_db / 20.0) * 32768
    
    min_silence_samples = int(min_silence_duration * sample_rate)
    
    # Scan for silence
    silence_start = None
    for i in range(start_idx, min(end_idx, len(audio))):
        if abs(audio[i]) < silence_threshold:
            if silence_start is None:
                silence_start = i
            elif (i - silence_start) >= min_silence_samples:
                # Found sufficient silence
                return (silence_start + i) // 2  # Return midpoint
        else:
            silence_start = None
    
    return None

def calculate_local_offset(audio1, audio2, start_idx1, start_idx2, window_samples, max_shift_samples):
    """
    Calculate the offset between two audio segments using cross-correlation.
    Uses the envelope (absolute value) to be robust against dubbing differences.
    Returns the offset in samples (positive means audio1 is ahead).
    """
    # We want to compare window1 (from audio1) against a range in audio2
    # window1 length: window_samples
    # Search range in audio2: [start_idx2 - max_shift, start_idx2 + window_samples + max_shift]
    
    # Define window1
    end_idx1 = min(start_idx1 + window_samples, len(audio1))
    window1 = np.abs(audio1[start_idx1:end_idx1]).astype(np.float32)
    
    if len(window1) < window_samples // 2:
        return None, 0.0
        
    # Define search window in audio2
    # We need enough context to slide window1 across +/- max_shift
    search_start_idx2 = max(0, start_idx2 - max_shift_samples)
    search_end_idx2 = min(len(audio2), start_idx2 + window_samples + max_shift_samples)
    
    window2_search = np.abs(audio2[search_start_idx2:search_end_idx2]).astype(np.float32)
    
    if len(window2_search) < len(window1):
        return None, 0.0

    # Normalize
    window1 -= np.mean(window1)
    window2_search -= np.mean(window2_search)
    
    std1 = np.std(window1)
    std2_full = np.std(window2_search)
    
    if std1 < 1e-6 or std2_full < 1e-6:
        return 0, 0.0
        
    window1 /= std1
    # We can't easily normalize window2 sliding window variance with standard correlate,
    # but for local sync check, standard cross-correlation is usually "good enough" if amplitudes are similar.
    # To be strictly correct like Pearson correlation, we'd need sliding dot product / (std1 * sliding_std2).
    # For speed, let's just normalize the whole search window roughly or accept unnormalized cross-corr magnitude might vary.
    # Better approach for speed + accuracy:
    # Just use correlate, and divide by length.
    
    window2_search /= std2_full # Rough normalization
    
    # np.correlate(a, v, mode='valid')
    # This slides v across a.
    # We want to slide window1 across window2_search.
    # correlate(large, small) -> valid outputs
    
    cross_corr = np.correlate(window2_search, window1, mode='valid')
    
    if len(cross_corr) == 0:
        return 0, 0.0
        
    best_idx = np.argmax(cross_corr)
    max_corr = cross_corr[best_idx] / len(window1)
    
    # Map best_idx back to shift
    # window2_search starts at search_start_idx2
    # The match starts at search_start_idx2 + best_idx
    # We want shift relative to start_idx2
    # If match is at start_idx2, shift is 0.
    # match_pos = search_start_idx2 + best_idx
    # shift = match_pos - start_idx2
    
    shift = (search_start_idx2 + best_idx) - start_idx2
    
    # Constrain shift to max_shift_samples (in case we picked up something outside)
    if abs(shift) > max_shift_samples:
        # This can happen if the peak is at the very edge
        return 0, 0.0
        
    return shift, max_corr

def print_progress(current, total, prefix='', suffix='', decimals=1, length=50, fill='█'):
    """
    Call in a loop to create terminal progress bar
    """
    percent = ("{0:." + str(decimals) + "f}").format(100 * (current / float(total)))
    filled_length = int(length * current // total)
    bar = fill * filled_length + '-' * (length - filled_length)
    print(f'\r{prefix} |{bar}| {percent}% {suffix}', end='\r')
    # Print a new line on completion
    if current == total:
        print()

def calculate_segments(file1, file2, sample_rate=4000):
    """
    Calculate synchronization segments for two audio files.
    Returns a list of segments with start_time, end_time, and offset.
    """
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("📊 Starting segment-based synchronization")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
    
    # Extract audio
    audio1 = get_audio_data(file1, sample_rate)
    audio2 = get_audio_data(file2, sample_rate)
    
    print(f"Audio 1 samples: {len(audio1)} ({len(audio1)/sample_rate:.1f}s)")
    print(f"Audio 2 samples: {len(audio2)} ({len(audio2)/sample_rate:.1f}s)\n")
    
    # Normalize
    audio1 = audio1.astype(np.float32)
    audio2 = audio2.astype(np.float32)
    
    # Parameters
    sync_window_seconds = 5.0  # Window to check sync
    check_interval_seconds = 1.0  # How often to check (reduced from 2.0 for more precision)
    sync_threshold = 0.25  # Lower threshold for envelope correlation (was 0.3)
    max_shift_seconds = 2.0  # Maximum shift to search
    
    sync_window_samples = int(sync_window_seconds * sample_rate)
    check_interval_samples = int(check_interval_seconds * sample_rate)
    max_shift_samples = int(max_shift_seconds * sample_rate)
    
    segments = []
    current_segment_start = 0  # In audio1 time
    current_offset_samples = 0  # Current offset of audio1 relative to audio2
    
    
    # Detect where audio actually starts in each track
    print("Detecting audio start points...")
    energy_threshold = 1000  # Minimum energy level to consider non-silence
    window_size = sample_rate * 1  # 1 second windows
    
    def find_audio_start(audio, sample_rate, threshold):
        """Find the first point where audio has significant energy"""
        for i in range(0, len(audio) - window_size, window_size // 2):
            window_energy = np.mean(np.abs(audio[i:i+window_size]))
            if window_energy > threshold:
                return i
        return 0  # If no audio found, assume start at 0
    
    audio1_start = find_audio_start(audio1, sample_rate, energy_threshold)
    audio2_start = find_audio_start(audio2, sample_rate, energy_threshold)
    
    print(f"Audio 1 starts at: {audio1_start/sample_rate:.1f}s")
    print(f"Audio 2 starts at: {audio2_start/sample_rate:.1f}s")
    
    # Initial offset calculation based on audio start difference
    # If audio1 starts at 0s and audio2 at 7s, offset should be +7s (audio1 is ahead)
    # If audio1 starts at 7s and audio2 at 0s, offset should be -7s (audio1 is behind)
    print("Calculating initial global offset from audio start points...")
    
    # Use the later of the two start points for correlation
    reference_point = max(audio1_start, audio2_start)
    
    # Calculate precise offset from the reference point
    initial_shift, initial_corr = calculate_local_offset(
        audio1, audio2, reference_point, reference_point, 
        sync_window_samples * 4, max_shift_samples * 4
    )
    
    if initial_shift is not None and initial_corr > 0.15:
        # Combine the start point difference with the detected shift
        start_diff = audio2_start - audio1_start
        current_offset_samples = start_diff + initial_shift
        print(f"Initial offset: {start_diff/sample_rate:.4f}s (start diff) + {initial_shift/sample_rate:.4f}s (correlation) = {current_offset_samples/sample_rate:.4f}s")
        print(f"Correlation confidence: {initial_corr:.3f}")
    else:
        # If correlation fails, use just the start difference
        current_offset_samples = audio2_start - audio1_start
        print(f"Using start point difference: {current_offset_samples/sample_rate:.4f}s (low correlation: {initial_corr:.3f if initial_corr else 0:.3f})")
    
    print("\nAnalyzing synchronization...")
    
    total_samples = len(audio1)
    
    # Start from the beginning - we don't skip any time
    idx1 = 0
    last_sync_idx1 = 0
    
    while idx1 < len(audio1) - sync_window_samples:
        # Update progress bar
        print_progress(idx1, total_samples, prefix='Progress:', suffix='Complete', length=40)
        
        # Calculate where we should be in audio2
        idx2 = idx1 + current_offset_samples
        
        # Check if idx2 is within bounds
        if idx2 < 0 or idx2 >= len(audio2) - sync_window_samples:
            idx1 += check_interval_samples
            continue
        
        # Calculate current sync state
        shift, correlation = calculate_local_offset(
            audio1, audio2, 
            idx1, idx2, 
            sync_window_samples, 
            max_shift_samples
        )
        
        # Determine if we're still in sync
        is_synced = (shift is not None and 
                     correlation is not None and 
                     correlation >= sync_threshold and 
                     abs(shift) < max_shift_samples)
        
        if is_synced:
            # Still in sync, update last sync position
            last_sync_idx1 = idx1
            idx1 += check_interval_samples
        else:
            # Clear progress line for log message
            print(f"\r{' ' * 80}\r", end='')
            
            # Lost sync! Create a segment
            print(f"⚠️  Desynchronization detected at {idx1/sample_rate:.1f}s")
            print(f"   Correlation: {correlation:.3f}, Relative Shift: {shift/sample_rate:.3f}s")
            
            # Find silence between last_sync_idx1 and idx1
            search_start = last_sync_idx1
            search_end = idx1 + sync_window_samples # Look a bit forward too
            
            silence_idx = find_silence(audio1, sample_rate, search_start, search_end)
            
            if silence_idx is None:
                # No silence found, use last sync point
                segment_end_idx = last_sync_idx1
                print(f"   No silence found, cutting at last sync point: {segment_end_idx/sample_rate:.1f}s")
            else:
                segment_end_idx = silence_idx
                print(f"   Silence found, cutting at: {segment_end_idx/sample_rate:.1f}s")
            
            # Try to find where sync is restored
            print(f"   Searching for stable synchronization...")
            search_idx1 = idx1
            best_new_offset = current_offset_samples
            best_corr = 0.0
            resume_idx = idx1
            attempts = 0
            max_attempts = 50
            
            while search_idx1 < len(audio1) - sync_window_samples and attempts < max_attempts:
                attempts += 1
                test_idx2 = search_idx1 + current_offset_samples + shift
                
                if test_idx2 < 0 or test_idx2 >= len(audio2) - sync_window_samples:
                    search_idx1 += check_interval_samples
                    continue
                
                test_shift, test_corr = calculate_local_offset(
                    audio1, audio2,
                    search_idx1, test_idx2,
                    sync_window_samples,
                    max_shift_samples
                )
                
                if test_corr is not None and test_corr > sync_threshold:
                    # Found stable sync
                    best_new_offset = current_offset_samples + shift + test_shift
                    best_corr = test_corr
                    resume_idx = search_idx1
                    print(f"   ✓ Stable sync found at {resume_idx/sample_rate:.1f}s (Corr: {best_corr:.3f})")
                    break
                
                search_idx1 += check_interval_samples
            
            if attempts >= max_attempts:
                print(f"   ⚠️  Could not find stable sync within search window")
                best_new_offset = current_offset_samples + shift
                resume_idx = idx1 + int(5.0 * sample_rate)
            
            # Check if the new offset is significantly different
            offset_diff = abs(best_new_offset - current_offset_samples) / sample_rate
            min_offset_change = 0.3 # User requested 0.3s threshold
            
            if offset_diff < min_offset_change:
                print(f"   ℹ️  Offset change too small ({offset_diff:.4f}s < {min_offset_change}s). Keeping old offset.")
                # We skip the bad section but don't create a new segment
                # Effectively we extend the current segment
                
                # We need to update idx1 to skip the bad part, but we don't add to segments list
                # and we don't update current_offset_samples
                
                # However, we must ensure we don't just loop back to the same error.
                # resume_idx is where we found stability.
                
                idx1 = max(resume_idx, segment_end_idx + int(1.0 * sample_rate))
                last_sync_idx1 = idx1
                
                # If we haven't added any segments yet, we just continue
                # If we have, the last segment in the list is now "open" again?
                # Actually, our logic appends segments when desync is found.
                # If we decide NOT to create a segment here, we just continue the loop.
                # The "current_segment_start" remains what it was.
                # So the next segment will just be longer.
                
            else:
                # Offset changed significantly, create the segment
                
                # Create segment for the PREVIOUS stable block
                segment_start_time = current_segment_start / sample_rate
                segment_end_time = segment_end_idx / sample_rate
                offset_seconds = current_offset_samples / sample_rate
                
                if segment_end_time > segment_start_time:
                    segments.append({
                        'start_time': segment_start_time,
                        'end_time': segment_end_time,
                        'offset': offset_seconds,
                        'duration': segment_end_time - segment_start_time
                    })
                
                # Update state for NEW segment
                current_offset_samples = best_new_offset
                current_segment_start = segment_end_idx
                
                # Ensure we advance past the problem area
                idx1 = max(resume_idx, segment_end_idx + int(1.0 * sample_rate))
                last_sync_idx1 = idx1
            
    # Final progress update
    print_progress(total_samples, total_samples, prefix='Progress:', suffix='Complete', length=40)
    
    # Add final segment
    segment_start_time = current_segment_start / sample_rate
    segment_end_time = len(audio1) / sample_rate
    offset_seconds = current_offset_samples / sample_rate
    
    if segment_end_time - segment_start_time > 1.0:  # Only if significant duration
        segments.append({
            'start_time': segment_start_time,
            'end_time': segment_end_time,
            'offset': offset_seconds,
            'duration': segment_end_time - segment_start_time
        })
    
    return segments

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python calculate_segments.py <file1> <file2>")
        sys.exit(1)
    
    file1 = sys.argv[1]
    file2 = sys.argv[2]
    
    try:
        segments = calculate_segments(file1, file2)
        
        # Display segments
        print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"📊 Segments detected: {len(segments)}")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
        
        for i, seg in enumerate(segments, 1):
            start_min = int(seg['start_time'] // 60)
            start_sec = seg['start_time'] % 60
            end_min = int(seg['end_time'] // 60)
            end_sec = seg['end_time'] % 60
            
            print(f"Segment {i}: {start_min:02d}:{start_sec:05.2f} - {end_min:02d}:{end_sec:05.2f} | Offset: {seg['offset']:+.4f}s")
        
        # Save to JSON file
        output_data = {
            'segments': segments
        }
        
        with open('segments.json', 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2)
        
        print("\n✅ Segments saved to segments.json")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
