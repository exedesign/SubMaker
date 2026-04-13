#!/usr/bin/env python
"""Fix MP3 metadata warnings in vocal_isolator.py"""
import re

file_path = r"d:\AI\SubMaker\backend\services\vocal_isolator.py"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find and replace line by line for precision
result = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Look for the padding case - first subprocess.run with apad
    if 'if src_duration > 0 and src_duration < min_duration_sec:' in line:
        result.append(line)
        i += 1
        # Collect lines until we find the subprocess.run closing
        while i < len(lines) and 'subprocess.run(' not in lines[i]:
            result.append(lines[i])
            i += 1
        
        if i < len(lines) and 'subprocess.run(' in lines[i]:
            # This is the first case (padding)
            result.append(lines[i])  # subprocess.run(
            i += 1
            result.append(lines[i])  # ["ffmpeg",
            
            # Update FFmpeg command
            result[-1] = result[-1].replace('["ffmpeg", "-y", "-i",', 
                                           '["ffmpeg", "-y", "-hide_banner", "-loglevel", "quiet",')
            i += 1
            
            # Add comment before subprocess.run
            result.insert(-2, '                # Suppress FFmpeg metadata warnings (e.g., "Incorrect BOM value" from broken MP3 ID3 tags)\n')
            
            # Collect lines until check=True
            while i < len(lines) and 'check=True' not in lines[i]:
                line_content = lines[i]
                # Add -vn flag before temp_wav
                if 'pcm_s16le",' in line_content and 'temp_wav' in lines[i+1]:
                    line_content = line_content.rstrip() + '\n'
                    result.append(line_content)
                    i += 1
                    result.append(lines[i].replace('temp_wav]', '-vn", temp_wav]'))
                    i += 1
                    continue
                result.append(line_content)
                i += 1
            
            # Update check=True line to add stdout/stderr
            if i < len(lines):
                result.append(lines[i])
                i += 1
                if i < len(lines) and ')' in lines[i]:
                    result.append('                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL\n')
                    result.append(lines[i])
                    i += 1
    else:
        result.append(line)
        i += 1

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(result)

print("✅ MP3 metadata hatası düzeltildi")
