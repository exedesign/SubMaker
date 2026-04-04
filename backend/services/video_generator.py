"""
Video Generator Service
Creates videos from audio files with customizable backgrounds
"""
import os
import subprocess
import time
import uuid
from typing import Optional, Dict, Any, Tuple
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent))
from config import (
    FFMPEG_PATH, TEMP_DIR, OUTPUT_DIR, VIDEO_FORMATS, RESOLUTION_PRESETS,
    DEFAULT_FPS, DEFAULT_VIDEO_CODEC, DEFAULT_AUDIO_CODEC,
    DEFAULT_AUDIO_BITRATE, OUTPUT_FORMATS, ENABLE_GPU_ACCELERATION,
    HARDWARE_CODECS, BACKGROUND_IMAGE_OPTIMIZATION, BACKGROUND_QUALITY,
    ASS_PERFORMANCE_MODE, ASS_FONT_CACHE, ASS_SHAPER_SIMPLE
)


class VideoGenerator:
    """Service for generating videos from audio files"""
    
    def __init__(self, ffmpeg_path: str = FFMPEG_PATH):
        self.ffmpeg_path = ffmpeg_path
        self.hardware_codec = None
        self.gpu_type = None
        self.has_cuda_filters = False
        self._verify_ffmpeg()
        if ENABLE_GPU_ACCELERATION:
            self._detect_gpu_support()
    
    def _verify_ffmpeg(self) -> bool:
        """Verify FFmpeg is available"""
        try:
            result = subprocess.run(
                [self.ffmpeg_path, "-version"],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            return result.returncode == 0
        except FileNotFoundError:
            raise RuntimeError(
                f"FFmpeg not found at '{self.ffmpeg_path}'. "
                "Please install FFmpeg and add it to PATH."
            )
    
    def _detect_gpu_support(self):
        """Detect available GPU encoders for 4K acceleration"""
        try:
            # Get list of available encoders
            result = subprocess.run(
                [self.ffmpeg_path, "-encoders"],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            
            if result.returncode == 0:
                encoders_output = result.stdout.lower()
                
                # Check for NVIDIA NVENC
                if "h264_nvenc" in encoders_output:
                    self.gpu_type = "nvidia"
                    self.hardware_codec = HARDWARE_CODECS["nvidia"]["h264"]
                    print(f"🚀 NVIDIA GPU acceleration enabled for 4K rendering")
                
                # Check for Intel QuickSync
                elif "h264_qsv" in encoders_output:
                    self.gpu_type = "intel" 
                    self.hardware_codec = HARDWARE_CODECS["intel"]["h264"]
                    print(f"🚀 Intel QuickSync acceleration enabled for 4K rendering")
                    
                # Check for AMD AMF
                elif "h264_amf" in encoders_output:
                    self.gpu_type = "amd"
                    self.hardware_codec = HARDWARE_CODECS["amd"]["h264"]
                    print(f"🚀 AMD GPU acceleration enabled for 4K rendering")
                
                else:
                    print(f"ℹ️ No GPU acceleration detected, using CPU encoding")
            
        except Exception as e:
            print(f"⚠️ GPU detection failed: {e}, falling back to CPU encoding")
        
        # Detect CUDA filter support for overlay/scale acceleration
        self.has_cuda_filters = False
        if self.gpu_type == "nvidia":
            self._detect_cuda_filters()
    
    def _detect_cuda_filters(self):
        """Detect if FFmpeg has overlay_cuda and scale_cuda filters"""
        try:
            result = subprocess.run(
                [self.ffmpeg_path, "-filters"],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            if result.returncode == 0:
                filters_output = result.stdout.lower()
                has_overlay = "overlay_cuda" in filters_output
                has_scale = "scale_cuda" in filters_output
                self.has_cuda_filters = has_overlay and has_scale
                if self.has_cuda_filters:
                    print(f"🚀 CUDA filters available (overlay_cuda + scale_cuda)")
                else:
                    print(f"ℹ️ CUDA filters not available (overlay_cuda={has_overlay}, scale_cuda={has_scale}), using CPU filters")
        except Exception as e:
            print(f"⚠️ CUDA filter detection failed: {e}")
            self.has_cuda_filters = False
    
    def _preconvert_gif_to_mp4(self, gif_path: str, target_width: int, video_duration: float) -> str:
        """
        Pre-convert an animated GIF to a looped MP4 matching the video duration.
        MP4 decode is ~5-10x faster than GIF decode in FFmpeg filter chains.
        Also pre-scales to target width to eliminate scale filter in filter_complex.
        
        Returns path to the temporary MP4 file.
        """
        temp_mp4 = str(TEMP_DIR / f"gif_{uuid.uuid4().hex[:8]}.mp4")
        
        cmd = [
            self.ffmpeg_path, "-y",
            "-ignore_loop", "0",        # Read all GIF loop frames
            "-stream_loop", "-1",        # Loop input indefinitely
            "-i", gif_path,
            "-t", str(video_duration),   # Trim to video duration
            "-vf", f"scale={target_width}:-1:flags=lanczos,format=yuva420p",
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "fast",
            "-movflags", "+faststart",
            "-an",                       # No audio
            temp_mp4
        ]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=60
            )
            if result.returncode == 0 and os.path.exists(temp_mp4):
                gif_size = os.path.getsize(gif_path)
                mp4_size = os.path.getsize(temp_mp4)
                print(f"[VideoGen] GIF→MP4: {gif_path} ({gif_size//1024}KB) → {temp_mp4} ({mp4_size//1024}KB)")
                return temp_mp4
            else:
                print(f"[VideoGen] GIF→MP4 conversion failed: {result.stderr[-500:]}")
                return gif_path  # Fallback to original GIF
        except subprocess.TimeoutExpired:
            print(f"[VideoGen] GIF→MP4 conversion timed out, using original GIF")
            return gif_path
        except Exception as e:
            print(f"[VideoGen] GIF→MP4 conversion error: {e}, using original GIF")
            return gif_path
    
    def get_audio_duration(self, audio_path: str) -> float:
        """Get duration of audio file in seconds"""
        cmd = [
            self.ffmpeg_path, "-i", audio_path,
            "-hide_banner", "-f", "null", "-"
        ]
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        # Parse duration from stderr
        import re
        stderr = result.stderr or ""
        match = re.search(r"Duration: (\d+):(\d+):(\d+)\.(\d+)", stderr)
        if match:
            h, m, s, ms = map(int, match.groups())
            return h * 3600 + m * 60 + s + ms / 100
        return 0
    
    def _get_resolution(self, format_type: str, resolution: str = None) -> Tuple[int, int]:
        """Get resolution for format type, optionally using a resolution preset (1k/2k/4k)"""
        if resolution and resolution in RESOLUTION_PRESETS:
            preset = RESOLUTION_PRESETS[resolution]
            if format_type in preset:
                return preset[format_type]["width"], preset[format_type]["height"]
        format_config = VIDEO_FORMATS.get(format_type, VIDEO_FORMATS["horizontal"])
        return format_config["width"], format_config["height"]
    
    def _cleanup_temp_images(self):
        """Clean up temporary processed images for better performance"""
        try:
            temp_files = [f for f in os.listdir(TEMP_DIR) if f.startswith("bg_") and f.endswith("_temp.jpg")]
            for temp_file in temp_files:
                temp_path = TEMP_DIR / temp_file
                if temp_path.exists():
                    # Check if file is older than 1 hour (avoid deleting currently used files)
                    file_age = time.time() - temp_path.stat().st_mtime
                    if file_age > 3600:  # 1 hour
                        temp_path.unlink()
                        print(f"🗑️ Cleaned up old temp image: {temp_file}")
        except Exception as e:
            print(f"⚠️ Temp cleanup warning: {e}")
    
    def _preprocess_background_image(
        self, 
        image_path: str, 
        width: int, 
        height: int
    ) -> str:
        """Pre-process background image to exact dimensions for 4K performance"""
        
        # Skip preprocessing if disabled
        if not BACKGROUND_IMAGE_OPTIMIZATION:
            return image_path
        
        # Create temp processed image path
        temp_image_name = f"bg_{uuid.uuid4().hex}_temp.jpg"
        temp_image_path = str(TEMP_DIR / temp_image_name)
        
        # Pre-process image to exact size with FFmpeg (much faster than runtime scaling)
        cmd = [
            self.ffmpeg_path, "-y",
            "-i", image_path,
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                   f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black",
            "-q:v", str(max(1, min(31, 32 - (BACKGROUND_QUALITY // 3)))),  # Convert quality % to FFmpeg scale (1-31)
            "-frames:v", "1",  # Single frame
            temp_image_path
        ]
        
        try:
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            
            if result.returncode != 0:
                print(f"⚠️ Image preprocessing failed, using original: {result.stderr}")
                return image_path
            
            print(f"🚀 4K Background optimized: {temp_image_name}")
            return temp_image_path
            
        except Exception as e:
            print(f"⚠️ Image preprocessing error: {e}, using original")
            return image_path
    
    def _build_background_input(
        self,
        background_type: str,
        background_value: str,
        width: int,
        height: int,
        fps: int,
        duration: float
    ) -> list:
        """Build FFmpeg input arguments for background"""
        
        if background_type == "color":
            # Solid color background
            color = background_value.lstrip("#")
            return [
                "-f", "lavfi",
                "-i", f"color=c=0x{color}:s={width}x{height}:r={fps}:d={duration}"
            ]
        
        elif background_type == "transparent":
            # Transparent background (for WebM/MOV output)
            return [
                "-f", "lavfi",
                "-i", f"color=c=black@0.0:s={width}x{height}:r={fps}:d={duration}",
                "-pix_fmt", "yuva420p"
            ]
        
        elif background_type == "image":
            # CUDA-optimized background image processing
            processed_image = self._preprocess_background_image(background_value, width, height)
            if self.hardware_codec and self.gpu_type == "nvidia":
                # Optimized for NVENC with static image
                return [
                    "-loop", "1",  # Loop prevention for disk I/O bottleneck 
                    "-framerate", str(fps),
                    "-i", processed_image,
                    "-t", str(duration)
                ]
            else:
                # Standard image input
                return [
                    "-framerate", str(fps),  # Static framerate for image
                    "-loop", "1",
                    "-i", processed_image,
                    "-t", str(duration)
                ]
        
        else:
            raise ValueError(f"Unknown background type: {background_type}")
    
    def _build_video_filter(
        self,
        background_type: str,
        width: int,
        height: int
    ) -> str:
        """Build video filter for scaling/padding with CUDA acceleration"""
        
        # Add pixel format conversion for GPU compatibility
        if background_type == "image" and self.hardware_codec and self.gpu_type == "nvidia":
            # Format conversion filter for NVENC compatibility
            return f"format=yuv420p,scale={width}:{height}"
        
        # For other background types, no filtering needed
        return None
    
    def _build_output_args(
        self,
        output_format: str,
        background_type: str,
        quality: str = "high"
    ) -> list:
        """Build FFmpeg output arguments based on format"""
        
        format_config = OUTPUT_FORMATS.get(output_format, OUTPUT_FORMATS["mp4"])
        args = []
        
        if output_format == "webm":
            args.extend(["-c:v", "libvpx-vp9"])
            if background_type == "transparent":
                args.extend(["-pix_fmt", "yuva420p"])
            # Quality settings - Optimized for 4K Webm
            if quality == "high":
                args.extend(["-crf", "22", "-b:v", "0"])  # Better for 4K
            elif quality == "medium":
                args.extend(["-crf", "30", "-b:v", "0"])  # Balanced
            else:
                args.extend(["-crf", "35", "-b:v", "0"])  # Fast
                
        elif output_format == "mov":
            args.extend(["-c:v", "prores_ks", "-profile:v", "4444"])
            if background_type == "transparent":
                args.extend(["-pix_fmt", "yuva444p10le"])
                
        else:  # mp4
            # Use GPU acceleration if available for 4K performance
            if self.hardware_codec and ENABLE_GPU_ACCELERATION:
                args.extend(["-c:v", self.hardware_codec])
                args.extend(["-pix_fmt", "yuv420p"])
                
                gpu_config = HARDWARE_CODECS[self.gpu_type]
                
                # Add GPU-specific properties
                if "properties" in gpu_config:
                    args.extend(gpu_config["properties"])
                
                # GPU-optimized quality settings for 4K
                if quality == "high":
                    if self.gpu_type == "nvidia":
                        args.extend(["-cq", "18", "-preset", "fast"])  # Improved quality
                    else:
                        args.extend(["-global_quality", "20"])
                elif quality == "medium":
                    if self.gpu_type == "nvidia":
                        args.extend(["-cq", "23", "-preset", "fast"])
                    else:
                        args.extend(["-global_quality", "25"])
                else:
                    if self.gpu_type == "nvidia":
                        args.extend(["-cq", "28", "-preset", "fast"])
                    else:
                        args.extend(["-global_quality", "30"])
            else:
                # Fallback to CPU encoding
                args.extend(["-c:v", DEFAULT_VIDEO_CODEC])
                args.extend(["-pix_fmt", "yuv420p"])
                # Quality settings - Optimized for 4K performance
                if quality == "high":
                    args.extend(["-crf", "20", "-preset", "medium"])  # Faster than slow
                elif quality == "medium":
                    args.extend(["-crf", "25", "-preset", "fast"])    # Balanced speed/quality
                else:
                    args.extend(["-crf", "30", "-preset", "fast"])    # Fast render
        
        # Audio settings
        args.extend(["-c:a", DEFAULT_AUDIO_CODEC, "-b:a", DEFAULT_AUDIO_BITRATE])
        
        return args
    
    def generate_video(
        self,
        audio_path: str,
        output_path: Optional[str] = None,
        background_type: str = "color",
        background_value: str = "#000000",
        format_type: str = "horizontal",
        output_format: str = "mp4",
        quality: str = "high",
        fps: int = DEFAULT_FPS,
        progress_callback: Optional[callable] = None,
        cancel_check: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """
        Generate a video from an audio file with specified background

        Args:
            audio_path: Path to audio file (MP3, WAV, etc.)
            output_path: Output video path (optional, auto-generated if None)
            background_type: 'color', 'image', or 'transparent'
            background_value: Hex color code or image path
            format_type: 'horizontal' (16:9), 'vertical' (9:16), or 'square' (1:1)
            output_format: 'mp4', 'webm', or 'mov'
            quality: 'high', 'medium', or 'low'
            fps: Frames per second
            progress_callback: Progress callback function
            
        Returns:
            Dict with output path and metadata
        """
        # Validate inputs
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        # Handle blob URLs gracefully (fallback to color background)
        if background_type == "image":
            if background_value.startswith("blob:") or not os.path.exists(background_value):
                print(f"⚠️ Invalid image path (blob URL or not found): {background_value}")
                print(f"🔄 Falling back to black color background")
                background_type = "color"
                background_value = "#000000"
        
        # Clean up old temp images for better performance
        self._cleanup_temp_images()
        # Get resolution
        width, height = self._get_resolution(format_type)
        
        # Get audio duration
        duration = self.get_audio_duration(audio_path)
        
        # Generate output path if not provided
        if output_path is None:
            output_filename = f"{uuid.uuid4().hex}.{output_format}"
            output_path = str(OUTPUT_DIR / output_filename)
        
        # Build FFmpeg command with optimized GPU settings
        cmd = [self.ffmpeg_path, "-y"]
        
        # Simplified CUDA for better compatibility
        if self.hardware_codec and self.gpu_type == "nvidia":
            cmd.extend(["-hwaccel", "auto"])  # Auto hardware acceleration
            print("🚀 Auto Hardware Acceleration enabled")
        
        # Add threading and performance optimizations for 4K
        cpu_count = os.cpu_count() or 4
        cmd.extend(["-threads", str(min(cpu_count, 8))])  # Cap at 8 threads for stability
        
        # Memory optimization for 4K
        if self.hardware_codec:
            # GPU encoding uses less RAM
            cmd.extend(["-thread_queue_size", "1024"])
        else:
            # CPU encoding needs more buffer for 4K
            cmd.extend(["-thread_queue_size", "2048"])
        
        # Add background input
        cmd.extend(self._build_background_input(
            background_type, background_value, width, height, fps, duration
        ))
        
        # Add audio input
        cmd.extend(["-i", audio_path])
        
        # Add video filter if needed
        vf = self._build_video_filter(background_type, width, height)
        if vf:
            cmd.extend(["-vf", vf])
        
        # Add output settings
        cmd.extend(self._build_output_args(output_format, background_type, quality))
        
        # Shortest flag to stop when audio ends
        cmd.append("-shortest")
        
        # Output path
        cmd.append(output_path)
        
        if progress_callback:
            progress_callback(10, "Starting video generation...")

        # Run FFmpeg
        gpu_info = f" (GPU: {self.gpu_type.upper()})" if self.hardware_codec else " (CPU)"
        bg_opt = " [Optimized BG]" if background_type == "image" and BACKGROUND_IMAGE_OPTIMIZATION else ""
        print(f"🎬 4K Video Rendering{gpu_info}{bg_opt}: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding='utf-8',
            errors='replace'
        )
        
        # Read stderr line-by-line for progress and cancellation
        import re as _re_gen
        stderr_lines = []
        for line in process.stderr:
            stderr_lines.append(line)
            
            # Report progress during base video generation
            if duration > 0 and "time=" in line:
                time_match = _re_gen.search(r"time=(\d+):(\d+):(\d+)\.(\d+)", line)
                if time_match:
                    h, m, s, cs = map(int, time_match.groups())
                    current_time = h * 3600 + m * 60 + s + cs / 100
                    if progress_callback:
                        gen_progress = min(90, int((current_time / duration) * 90))
                        progress_callback(gen_progress, "Generating base video...")
            
            if cancel_check and cancel_check():
                process.kill()
                process.wait()
                try:
                    os.remove(output_path)
                except Exception:
                    pass
                raise RuntimeError("Render cancelled")
        
        process.wait()
        stderr = "".join(stderr_lines)
        
        # Cleanup temp background image if created
        if background_type == "image":
            try:
                # Check if we created a temp processed image and clean it up
                temp_files = [f for f in os.listdir(TEMP_DIR) if f.startswith("bg_") and f.endswith("_temp.jpg")]
                for temp_file in temp_files:
                    temp_path = TEMP_DIR / temp_file
                    if temp_path.exists() and temp_file in str(background_value):
                        continue  # Don't delete if it's the current one being used
                    if temp_path.exists():
                        temp_path.unlink()
                        print(f"🗑️ Cleaned up temp image: {temp_file}")
            except Exception as e:
                print(f"⚠️ Cleanup warning: {e}")
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {stderr}")

        if progress_callback:
            perf_info = f" using {self.gpu_type.upper()} GPU" if self.hardware_codec else ""
            bg_info = " with optimized background" if background_type == "image" else ""
            progress_callback(100, f"4K Video generation complete{perf_info}{bg_info}!")

        return {
            "output_path": output_path,
            "duration": duration,
            "width": width,
            "height": height,
            "format": output_format,
            "background_type": background_type
        }
    
    def generate_video_with_subtitles(
        self,
        audio_path: str,
        subtitle_path: str,
        output_path: Optional[str] = None,
        background_type: str = "color",
        background_value: str = "#000000",
        background_image: Optional[str] = None,
        format_type: str = "horizontal",
        output_format: str = "mp4",
        quality: str = "high",
        font_path: Optional[str] = None,
        logo: Optional[Dict] = None,
        logos: Optional[list] = None,
        progress_callback: Optional[callable] = None,
        visualizer_video_path: Optional[str] = None,
        visualizer_opacity: float = 0.8,
        cancel_check: Optional[callable] = None,
        resolution: str = None,
    ) -> Dict[str, Any]:
        """
        Generate video with burned-in subtitles in a single FFmpeg pass.
        Background + audio + visualizer + logos + subtitles → final output in one encode.
        GIF logos are pre-converted to MP4 for ~5-10x faster decoding.
        """
        # Determine actual background value
        actual_bg_value = background_value
        if background_type == "image" and background_image:
            actual_bg_value = background_image
        
        # Validate inputs
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        # Handle blob URLs gracefully
        if background_type == "image":
            if actual_bg_value.startswith("blob:") or not os.path.exists(actual_bg_value):
                print(f"⚠️ Invalid image path: {actual_bg_value}, falling back to black")
                background_type = "color"
                actual_bg_value = "#000000"
        
        self._cleanup_temp_images()
        
        width, height = self._get_resolution(format_type, resolution)
        duration = self.get_audio_duration(audio_path)
        fps = DEFAULT_FPS

        # Generate output path if not provided
        if output_path is None:
            output_filename = f"submaker_{uuid.uuid4().hex[:8]}.{output_format}"
            output_path = str(OUTPUT_DIR / output_filename)
        
        # Track temp files for cleanup
        temp_files = []
        
        if progress_callback:
            progress_callback(5, "Preparing render...")
        
        # ── Build single-pass FFmpeg command ──────────────────────────
        cmd = [self.ffmpeg_path, "-y"]
        
        # Hardware acceleration — use GPU for encoding only (h264_nvenc).
        # CUDA filters (scale_cuda/overlay_cuda) are incompatible with ASS subtitle
        # filter which requires CPU-accessible frames, so we disable them.
        use_cuda_filters = False  # ASS subtitle filter is CPU-only
        if self.hardware_codec and self.gpu_type == "nvidia":
            cmd.extend(["-hwaccel", "auto"])
            print("🚀 NVIDIA GPU acceleration: hwaccel=auto + h264_nvenc encoding")
        
        # Threading
        cpu_count = os.cpu_count() or 4
        cmd.extend(["-threads", str(min(cpu_count, 8))])
        cmd.extend(["-thread_queue_size", "1024" if self.hardware_codec else "2048"])
        
        # ── Input 0: Background ───────────────────────────────────────
        bg_input = self._build_background_input(
            background_type, actual_bg_value, width, height, fps, duration
        )
        cmd.extend(bg_input)
        input_count = 1  # background is [0]
        
        # ── Input 1: Audio ────────────────────────────────────────────
        cmd.extend(["-i", audio_path])
        audio_idx = input_count
        input_count += 1
        
        # ── Input: Visualizer video (optional) ────────────────────────
        viz_input_idx = None
        if visualizer_video_path and os.path.exists(str(visualizer_video_path)):
            cmd.extend(["-i", str(visualizer_video_path)])
            viz_input_idx = input_count
            input_count += 1
            print(f"[VideoGen] Visualizer input added: {visualizer_video_path}")
        elif visualizer_video_path:
            print(f"[VideoGen] WARNING: Visualizer video not found: {visualizer_video_path}")
        
        # ── Collect & prepare logos ───────────────────────────────────
        all_logos = []
        if logos and len(logos) > 0:
            all_logos = logos
        elif logo and logo.get('enabled'):
            all_logos = [logo]
        
        logo_entries = []  # (input_path, logo_config, was_gif_converted)
        
        for i, single_logo in enumerate(all_logos):
            if not single_logo.get('enabled', True):
                continue
            
            # A10: Prefer imagePath over base64
            logo_path = single_logo.get('imagePath')
            
            if not logo_path or not os.path.exists(str(logo_path)):
                image_data = single_logo.get('imageData')
                if image_data and image_data.startswith('data:'):
                    try:
                        import base64
                        header, data = image_data.split(',', 1)
                        ext = '.gif' if 'gif' in header else '.png'
                        temp_logo_path = TEMP_DIR / f"logo_{uuid.uuid4().hex[:8]}{ext}"
                        with open(temp_logo_path, 'wb') as f:
                            f.write(base64.b64decode(data))
                        logo_path = str(temp_logo_path)
                        temp_files.append(logo_path)
                        print(f"[VideoGen] Logo {i+1} saved from base64: {logo_path}")
                    except Exception as e:
                        print(f"[VideoGen] Failed to save logo {i+1} from base64: {e}")
                        continue
            
            if not logo_path or not os.path.exists(logo_path):
                print(f"[VideoGen] Logo {i+1} path not found: {logo_path}")
                continue
            
            # A1-A2: Pre-convert GIF to MP4 with target size (A9: pre-scale)
            logo_size_pct = single_logo.get('size', 15)
            target_logo_width = int(width * logo_size_pct / 100)
            was_gif = logo_path.lower().endswith('.gif')
            
            if was_gif:
                converted_path = self._preconvert_gif_to_mp4(logo_path, target_logo_width, duration)
                if converted_path != logo_path:
                    temp_files.append(converted_path)
                logo_entries.append((converted_path, single_logo, True))
                print(f"[VideoGen] Logo {i+1} (GIF→MP4): {converted_path}")
            else:
                logo_entries.append((logo_path, single_logo, False))
                print(f"[VideoGen] Logo {i+1} ready: {logo_path}")
        
        # Add logo inputs to FFmpeg command
        logo_base_idx = input_count
        for logo_path, _, was_gif in logo_entries:
            # A3: No need for -ignore_loop since GIFs are pre-converted to MP4
            cmd.extend(["-i", logo_path])
            input_count += 1
        
        # ── Build filter_complex ──────────────────────────────────────
        filter_parts = []
        
        # Scale function names based on GPU availability
        scale_fn = "scale_cuda" if use_cuda_filters else "scale"
        overlay_fn = "overlay_cuda" if use_cuda_filters else "overlay"
        
        # Background: ensure correct format and size
        bg_needs_scale = (background_type == "image" and self.hardware_codec and self.gpu_type == "nvidia")
        if bg_needs_scale:
            filter_parts.append(f"[0:v]format=yuv420p,{scale_fn}={width}:{height}[bg]")
            current_output = "[bg]"
        else:
            current_output = "[0:v]"
        
        # Visualizer overlay
        if viz_input_idx is not None:
            viz_opacity = max(0.0, min(1.0, visualizer_opacity))
            filter_parts.append(
                f"[{viz_input_idx}:v]{scale_fn}={width}:{height},format=rgba,"
                f"colorchannelmixer=aa={viz_opacity}[viz_alpha]"
            )
            filter_parts.append(
                f"{current_output}[viz_alpha]{overlay_fn}=0:0:shortest=1[vwithviz]"
            )
            current_output = "[vwithviz]"
            print(f"[VideoGen] Visualizer overlay: opacity={viz_opacity}")
        
        # Logo overlays
        for idx, (logo_path, single_logo, was_gif) in enumerate(logo_entries):
            input_idx = logo_base_idx + idx
            
            logo_pos_x = single_logo.get('position', {}).get('x', 50)
            logo_pos_y = single_logo.get('position', {}).get('y', 50)
            logo_size_pct = single_logo.get('size', 15)
            logo_opacity = single_logo.get('opacity', 100) / 100
            logo_width = int(width * logo_size_pct / 100)
            
            pos_x = f"(main_w*{logo_pos_x}/100)-(overlay_w/2)"
            pos_y = f"(main_h*{logo_pos_y}/100)-(overlay_h/2)"
            
            output_label = "[vlogo]" if idx == len(logo_entries) - 1 else f"[vlogo{idx}]"
            logo_label = f"[logo{idx}]"
            
            # A9: GIF→MP4 was already pre-scaled; static images still need scale
            if was_gif:
                # Already scaled in _preconvert_gif_to_mp4 — only format + opacity
                scale_filter = f"[{input_idx}:v]format=rgba,colorchannelmixer=aa={logo_opacity}{logo_label}"
            else:
                scale_filter = f"[{input_idx}:v]{scale_fn}={logo_width}:-1,format=rgba,colorchannelmixer=aa={logo_opacity}{logo_label}"
            
            # A3: No eof_action=repeat needed for pre-converted MP4 (already loops to full duration)
            overlay_filter = f"{current_output}{logo_label}{overlay_fn}={pos_x}:{pos_y}{output_label}"
            
            filter_parts.append(scale_filter)
            filter_parts.append(overlay_filter)
            current_output = output_label
            
            print(f"[VideoGen] Logo {idx+1} filter: pos=({logo_pos_x},{logo_pos_y}), size={logo_size_pct}%, opacity={logo_opacity}, gif_converted={was_gif}")
        
        # Subtitle filter — always last in the chain
        subtitle_path_escaped = subtitle_path.replace("\\", "/").replace(":", r"\:")
        if subtitle_path.endswith(".ass"):
            subtitle_filter = f"ass='{subtitle_path_escaped}'"
            if ASS_PERFORMANCE_MODE:
                if ASS_SHAPER_SIMPLE:
                    subtitle_filter += ":shaping=simple"
                if not ASS_FONT_CACHE:
                    subtitle_filter += ":fontsdir=0"
        else:
            subtitle_filter = f"subtitles='{subtitle_path_escaped}'"
            if font_path:
                font_path_escaped = font_path.replace("\\", "/")
                subtitle_filter += f":fontsdir='{os.path.dirname(font_path_escaped)}'"
        
        filter_parts.append(f"{current_output}{subtitle_filter}[vout]")
        
        full_filter = ";".join(filter_parts)
        
        # ── Filter + mapping ──────────────────────────────────────────
        cmd.extend(["-filter_complex", full_filter])
        cmd.extend(["-map", "[vout]", "-map", f"{audio_idx}:a"])
        cmd.extend(["-c:a", DEFAULT_AUDIO_CODEC, "-b:a", DEFAULT_AUDIO_BITRATE])
        
        # Video codec
        if output_format == "webm":
            cmd.extend(["-c:v", "libvpx-vp9"])
        elif output_format == "mov":
            cmd.extend(["-c:v", "prores_ks", "-profile:v", "4444"])
        else:  # mp4
            if self.hardware_codec and self.gpu_type == "nvidia":
                cmd.extend(["-c:v", "h264_nvenc", "-preset", "fast", "-cq", "20"])
            elif self.hardware_codec:
                cmd.extend(["-c:v", self.hardware_codec])
            else:
                cmd.extend(["-c:v", DEFAULT_VIDEO_CODEC])
        
        cmd.extend(["-shortest"])
        cmd.append(output_path)
        
        # ── Execute ───────────────────────────────────────────────────
        print(f"[VideoGen] Single-pass render command: {' '.join(cmd)}")
        print(f"[VideoGen] Filter complex: {full_filter}")
        
        if progress_callback:
            progress_callback(10, "Rendering video...")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding='utf-8',
            errors='replace'
        )
        
        import re as _re
        stderr_lines = []
        for line in process.stderr:
            stderr_lines.append(line)
            if duration > 0 and "time=" in line:
                time_match = _re.search(r"time=(\d+):(\d+):(\d+)\.(\d+)", line)
                if time_match:
                    h, m, s, cs = map(int, time_match.groups())
                    current_time = h * 3600 + m * 60 + s + cs / 100
                    render_progress = min(0.95, current_time / duration)
                    scaled = 10 + int(render_progress * 85)  # 10-95%
                    if progress_callback:
                        progress_callback(scaled, "Rendering video...")
            
            if cancel_check and cancel_check():
                process.kill()
                process.wait()
                for tf in temp_files:
                    try: os.remove(tf)
                    except: pass
                try: os.remove(output_path)
                except: pass
                raise RuntimeError("Render cancelled")
        
        process.wait()
        stderr = "".join(stderr_lines)
        
        # ── Cleanup temp files ────────────────────────────────────────
        for tf in temp_files:
            try:
                os.remove(tf)
                print(f"🗑️ Cleaned up temp: {os.path.basename(tf)}")
            except:
                pass
        
        # Cleanup temp background image if created
        if background_type == "image":
            try:
                for f in os.listdir(TEMP_DIR):
                    if f.startswith("bg_") and f.endswith("_temp.jpg"):
                        p = TEMP_DIR / f
                        if p.exists():
                            p.unlink()
            except:
                pass
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg render failed: {stderr}")
        
        if progress_callback:
            progress_callback(100, "Complete!")
        
        gpu_info = f" ({self.gpu_type.upper()} GPU)" if self.hardware_codec else " (CPU)"
        cuda_info = " + CUDA filters" if use_cuda_filters else ""
        gif_info = f", {sum(1 for _,_,g in logo_entries if g)} GIF→MP4" if logo_entries else ""
        print(f"[VideoGen] ✅ Single-pass render complete{gpu_info}{cuda_info}{gif_info}")
        
        return {
            "output_path": output_path,
            "duration": duration,
            "width": width,
            "height": height,
            "format": output_format,
            "background_type": background_type,
            "subtitle_path": subtitle_path,
        }


# Singleton instance
_video_generator = None

def get_video_generator() -> VideoGenerator:
    """Get or create the video generator singleton"""
    global _video_generator
    if _video_generator is None:
        _video_generator = VideoGenerator()
    return _video_generator
