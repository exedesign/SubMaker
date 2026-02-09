"""
FFmpeg Processor Service
Handles all FFmpeg operations for video processing
"""
import os
import subprocess
import shutil
from typing import Optional, Dict, Any, List
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent))
from config import FFMPEG_PATH, TEMP_DIR, FONTS_DIR


class FFmpegProcessor:
    """Low-level FFmpeg command processor"""
    
    def __init__(self, ffmpeg_path: str = FFMPEG_PATH):
        self.ffmpeg_path = ffmpeg_path
        self._verify_installation()
    
    def _verify_installation(self) -> Dict[str, Any]:
        """Verify FFmpeg installation and get version info"""
        try:
            result = subprocess.run(
                [self.ffmpeg_path, "-version"],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            if result.returncode == 0:
                version_line = result.stdout.split("\n")[0]
                return {"installed": True, "version": version_line}
            else:
                raise RuntimeError("FFmpeg returned error")
        except FileNotFoundError:
            raise RuntimeError(
                f"FFmpeg not found. Please install FFmpeg and ensure it's in PATH."
            )
    
    def run_command(
        self,
        args: List[str],
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        Run an FFmpeg command
        
        Args:
            args: FFmpeg command arguments (without 'ffmpeg')
            progress_callback: Progress callback function
            
        Returns:
            Dict with success status and output
        """
        cmd = [self.ffmpeg_path] + args
        
        print(f"Running FFmpeg: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding='utf-8',
            errors='replace'
        )
        
        stdout, stderr = process.communicate()
        
        return {
            "success": process.returncode == 0,
            "returncode": process.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "command": " ".join(cmd)
        }
    
    def get_media_info(self, file_path: str) -> Dict[str, Any]:
        """Get media file information using ffprobe"""
        ffprobe_path = self.ffmpeg_path.replace("ffmpeg", "ffprobe")
        
        cmd = [
            ffprobe_path,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            file_path
        ]
        
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        if result.returncode == 0:
            import json
            return json.loads(result.stdout)
        else:
            return {"error": result.stderr}
    
    def extract_audio(
        self,
        video_path: str,
        output_path: str,
        format: str = "wav"
    ) -> str:
        """
        Extract audio from video file
        
        Args:
            video_path: Input video path
            output_path: Output audio path
            format: Audio format (wav, mp3, etc.)
            
        Returns:
            Path to extracted audio
        """
        args = [
            "-y",
            "-i", video_path,
            "-vn",  # No video
            "-acodec", "pcm_s16le" if format == "wav" else "libmp3lame",
            "-ar", "16000",  # Sample rate
            "-ac", "1",  # Mono
            output_path
        ]
        
        result = self.run_command(args)
        
        if not result["success"]:
            raise RuntimeError(f"Audio extraction failed: {result['stderr']}")
        
        return output_path
    
    def burn_subtitles(
        self,
        video_path: str,
        subtitle_path: str,
        output_path: str,
        font_dir: Optional[str] = None
    ) -> str:
        """
        Burn subtitles into video
        
        Args:
            video_path: Input video path
            subtitle_path: Subtitle file path (.ass or .srt)
            output_path: Output video path
            font_dir: Directory containing custom fonts
            
        Returns:
            Path to output video
        """
        # Escape path for FFmpeg filter
        sub_path_escaped = subtitle_path.replace("\\", "/").replace(":", r"\:")
        
        # Build subtitle filter
        if subtitle_path.endswith(".ass"):
            sub_filter = f"ass='{sub_path_escaped}'"
        else:
            sub_filter = f"subtitles='{sub_path_escaped}'"
        
        # Add fonts directory if specified
        if font_dir:
            font_dir_escaped = font_dir.replace("\\", "/")
            sub_filter += f":fontsdir='{font_dir_escaped}'"
        elif FONTS_DIR.exists():
            font_dir_escaped = str(FONTS_DIR).replace("\\", "/")
            sub_filter += f":fontsdir='{font_dir_escaped}'"
        
        args = [
            "-y",
            "-i", video_path,
            "-vf", sub_filter,
            "-c:a", "copy",
            "-c:v", "libx264",
            "-crf", "18",
            output_path
        ]
        
        result = self.run_command(args)
        
        if not result["success"]:
            raise RuntimeError(f"Subtitle burning failed: {result['stderr']}")
        
        return output_path
    
    def crop_to_vertical(
        self,
        video_path: str,
        output_path: str,
        target_width: int = 1080,
        target_height: int = 1920
    ) -> str:
        """
        Crop video to vertical format (9:16)
        
        Args:
            video_path: Input video path
            output_path: Output video path
            target_width: Target width
            target_height: Target height
            
        Returns:
            Path to output video
        """
        # Scale and crop to center
        filter_str = (
            f"scale=-1:{target_height},"
            f"crop={target_width}:{target_height}"
        )
        
        args = [
            "-y",
            "-i", video_path,
            "-vf", filter_str,
            "-c:a", "copy",
            output_path
        ]
        
        result = self.run_command(args)
        
        if not result["success"]:
            raise RuntimeError(f"Video cropping failed: {result['stderr']}")
        
        return output_path
    
    def crop_to_horizontal(
        self,
        video_path: str,
        output_path: str,
        target_width: int = 1920,
        target_height: int = 1080
    ) -> str:
        """
        Crop/scale video to horizontal format (16:9)
        
        Args:
            video_path: Input video path
            output_path: Output video path
            target_width: Target width
            target_height: Target height
            
        Returns:
            Path to output video
        """
        filter_str = (
            f"scale={target_width}:{target_height}:"
            f"force_original_aspect_ratio=decrease,"
            f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black"
        )
        
        args = [
            "-y",
            "-i", video_path,
            "-vf", filter_str,
            "-c:a", "copy",
            output_path
        ]
        
        result = self.run_command(args)
        
        if not result["success"]:
            raise RuntimeError(f"Video scaling failed: {result['stderr']}")
        
        return output_path
    
    def concatenate_videos(
        self,
        video_paths: List[str],
        output_path: str
    ) -> str:
        """
        Concatenate multiple videos
        
        Args:
            video_paths: List of video paths to concatenate
            output_path: Output video path
            
        Returns:
            Path to output video
        """
        # Create concat file
        concat_file = str(TEMP_DIR / "concat_list.txt")
        with open(concat_file, "w") as f:
            for path in video_paths:
                f.write(f"file '{path}'\n")
        
        args = [
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            output_path
        ]
        
        result = self.run_command(args)
        
        # Clean up
        os.remove(concat_file)
        
        if not result["success"]:
            raise RuntimeError(f"Video concatenation failed: {result['stderr']}")
        
        return output_path
    
    def add_audio_to_video(
        self,
        video_path: str,
        audio_path: str,
        output_path: str,
        replace_audio: bool = True
    ) -> str:
        """
        Add or replace audio in video
        
        Args:
            video_path: Input video path
            audio_path: Audio file path
            output_path: Output video path
            replace_audio: Whether to replace existing audio
            
        Returns:
            Path to output video
        """
        if replace_audio:
            args = [
                "-y",
                "-i", video_path,
                "-i", audio_path,
                "-c:v", "copy",
                "-c:a", "aac",
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-shortest",
                output_path
            ]
        else:
            # Mix audio
            args = [
                "-y",
                "-i", video_path,
                "-i", audio_path,
                "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first",
                "-c:v", "copy",
                output_path
            ]
        
        result = self.run_command(args)
        
        if not result["success"]:
            raise RuntimeError(f"Audio addition failed: {result['stderr']}")
        
        return output_path


# Singleton instance
_ffmpeg_processor = None

def get_ffmpeg_processor() -> FFmpegProcessor:
    """Get or create the FFmpeg processor singleton"""
    global _ffmpeg_processor
    if _ffmpeg_processor is None:
        _ffmpeg_processor = FFmpegProcessor()
    return _ffmpeg_processor
