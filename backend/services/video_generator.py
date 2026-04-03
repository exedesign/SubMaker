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
    FFMPEG_PATH, TEMP_DIR, OUTPUT_DIR, VIDEO_FORMATS,
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
    
    def _get_resolution(self, format_type: str) -> Tuple[int, int]:
        """Get resolution for format type"""
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
    ) -> Dict[str, Any]:
        """
        Generate video with burned-in subtitles
        
        Args:
            audio_path: Path to audio file
            subtitle_path: Path to ASS/SRT subtitle file
            output_path: Output video path
            background_type: 'color', 'image', or 'transparent'
            background_value: Hex color or image path
            background_image: Path to background image
            format_type: Video format
            output_format: Output format
            quality: Quality level
            font_path: Path to custom font file
            logo: Dict with logo settings (imagePath, position {x,y}, size, opacity)
            progress_callback: Progress callback
            background_value: Hex color or image path
            background_image: Path to background image
            format_type: Video format
            output_format: Output format
            quality: Quality level
            font_path: Path to custom font file
            progress_callback: Progress callback
            
        Returns:
            Dict with output path and metadata
        """
        # Determine actual background value
        actual_bg_value = background_value
        if background_type == "image" and background_image:
            actual_bg_value = background_image
        
        # First generate base video
        temp_video = str(TEMP_DIR / f"temp_{uuid.uuid4().hex}.{output_format}")
        
        result = self.generate_video(
            audio_path=audio_path,
            output_path=temp_video,
            background_type=background_type,
            background_value=actual_bg_value,
            format_type=format_type,
            output_format=output_format,
            quality=quality,
            progress_callback=lambda p, m: progress_callback(p // 2, m) if progress_callback else None,
            cancel_check=cancel_check,
        )

        # Generate output path if not provided
        if output_path is None:
            output_filename = f"submaker_{uuid.uuid4().hex[:8]}.{output_format}"
            output_path = str(OUTPUT_DIR / output_filename)
        
        # Build optimized subtitle filter for 4K performance  
        subtitle_path_escaped = subtitle_path.replace("\\", "/").replace(":", r"\:")
        
        if subtitle_path.endswith(".ass"):
            # Highly optimized ASS filter for 4K karaoke performance
            subtitle_filter = f"ass='{subtitle_path_escaped}'"
            
            if ASS_PERFORMANCE_MODE:
                # Performance optimizations for 4K ASS rendering
                if ASS_SHAPER_SIMPLE:
                    subtitle_filter += ":shaping=simple"  # Faster text shaping
                if not ASS_FONT_CACHE:
                    subtitle_filter += ":fontsdir=0"      # Disable font directory scanning
        else:
            subtitle_filter = f"subtitles='{subtitle_path_escaped}'"
            if font_path:
                font_path_escaped = font_path.replace("\\", "/")
                subtitle_filter += f":fontsdir='{os.path.dirname(font_path_escaped)}'"
        
        # Build complex filter chain
        filter_parts = []
        input_count = 1  # temp_video is [0]

        # Visualizer video overlay (rendered by frontend Butterchurn)
        viz_input_args = []
        if visualizer_video_path and os.path.exists(str(visualizer_video_path)):
            viz_input_args = ["-i", str(visualizer_video_path)]
            viz_input_idx = input_count
            input_count += 1
            # Scale visualizer to match video, apply opacity, overlay on base
            width_viz, height_viz = self._get_resolution(format_type)
            viz_opacity = max(0.0, min(1.0, visualizer_opacity))
            filter_parts.append(
                f"[{viz_input_idx}:v]scale={width_viz}:{height_viz},format=rgba,"
                f"colorchannelmixer=aa={viz_opacity}[viz_alpha]"
            )
            filter_parts.append(
                f"[0:v][viz_alpha]overlay=0:0:shortest=1[vwithviz]"
            )
            print(f"[VideoGen] Visualizer overlay added: {visualizer_video_path}, opacity={viz_opacity}")
        else:
            if visualizer_video_path:
                print(f"[VideoGen] WARNING: Visualizer video file not found: {visualizer_video_path}")

        # Collect all logos (support both single logo and logos array)
        all_logos = []
        if logos and len(logos) > 0:
            all_logos = logos
        elif logo and logo.get('enabled'):
            all_logos = [logo]
        
        # Process multiple logos
        logo_input_args = []
        logo_paths = []
        has_gif = False
        
        for i, single_logo in enumerate(all_logos):
            if not single_logo.get('enabled', True):
                continue
                
            # Try to get logo path
            logo_path = single_logo.get('imagePath')
            
            # If no valid path, check if we have imageData (base64)
            if not logo_path or not os.path.exists(str(logo_path)):
                image_data = single_logo.get('imageData')
                if image_data and image_data.startswith('data:'):
                    # Save base64 to temp file
                    try:
                        import base64
                        # Parse data URL
                        header, data = image_data.split(',', 1)
                        # Determine extension
                        ext = '.gif' if 'gif' in header else '.png'
                        temp_logo_path = TEMP_DIR / f"logo_{uuid.uuid4().hex[:8]}{ext}"
                        
                        with open(temp_logo_path, 'wb') as f:
                            f.write(base64.b64decode(data))
                        
                        logo_path = str(temp_logo_path)
                        print(f"[VideoGen] Saved logo {i+1} from base64 to: {logo_path}")
                    except Exception as e:
                        print(f"[VideoGen] Failed to save logo {i+1} from base64: {e}")
                        continue
            
            if logo_path and os.path.exists(logo_path):
                logo_paths.append((logo_path, single_logo))
                if logo_path.lower().endswith('.gif'):
                    has_gif = True
                print(f"[VideoGen] Logo {i+1} ready: {logo_path}")
            else:
                print(f"[VideoGen] Logo {i+1} path not found: {logo_path}")
        
        # Build filter for multiple logos
        if logo_paths:
            # Get video dimensions
            width, height = self._get_resolution(format_type)
            
            # Add all logo inputs with proper options for GIFs
            for logo_path, _ in logo_paths:
                if logo_path.lower().endswith('.gif'):
                    # For GIF: add ignore_loop to loop forever
                    logo_input_args.extend(["-ignore_loop", "0", "-i", logo_path])
                else:
                    logo_input_args.extend(["-i", logo_path])
            
            logo_base_idx = input_count  # logos start after temp_video + optional visualizer
            input_count += len(logo_paths)

            # Build overlay chain — start from visualizer output if present
            current_output = "[vwithviz]" if viz_input_args else "[0:v]"

            for idx, (logo_path, single_logo) in enumerate(logo_paths):
                input_idx = logo_base_idx + idx
                
                # Calculate logo position and size from percentages
                logo_pos_x = single_logo.get('position', {}).get('x', 50)
                logo_pos_y = single_logo.get('position', {}).get('y', 50)
                logo_size = single_logo.get('size', 15)  # % of video width
                logo_opacity = single_logo.get('opacity', 100) / 100
                
                # Logo width as percentage of video width
                logo_width = int(width * logo_size / 100)
                
                # Calculate position (convert % to pixels, accounting for logo center)
                pos_x = f"(main_w*{logo_pos_x}/100)-(overlay_w/2)"
                pos_y = f"(main_h*{logo_pos_y}/100)-(overlay_h/2)"
                
                # Check if it's an animated GIF
                is_gif = logo_path.lower().endswith('.gif')
                
                # Output label for this overlay
                if idx == len(logo_paths) - 1:
                    # Last logo outputs to [vlogo]
                    output_label = "[vlogo]"
                else:
                    output_label = f"[vlogo{idx}]"
                
                # Build filter for this logo
                logo_label = f"[logo{idx}]"
                scale_filter = f"[{input_idx}:v]scale={logo_width}:-1,format=rgba,colorchannelmixer=aa={logo_opacity}{logo_label}"
                
                # Use eof_action=repeat for GIFs to keep them looping, shortest=0 to use main video length
                if is_gif:
                    overlay_filter = f"{current_output}{logo_label}overlay={pos_x}:{pos_y}:eof_action=repeat:shortest=0{output_label}"
                else:
                    overlay_filter = f"{current_output}{logo_label}overlay={pos_x}:{pos_y}{output_label}"
                
                filter_parts.append(scale_filter)
                filter_parts.append(overlay_filter)
                
                # Next overlay uses this output as input
                current_output = output_label
                
                print(f"[VideoGen] Logo {idx+1} filter added: pos=({logo_pos_x},{logo_pos_y}), size={logo_size}%, opacity={logo_opacity}")
        
        # Add subtitle filter — output to [vout]
        has_complex_filter = bool(filter_parts)
        if logo_paths and filter_parts:
            filter_parts.append(f"[vlogo]{subtitle_filter}[vout]")
        elif filter_parts:
            filter_parts.append(f"[vwithviz]{subtitle_filter}[vout]")
        else:
            filter_parts.append(f"[0:v]{subtitle_filter}[vout]")
            has_complex_filter = True

        video_out_label = "[vout]"

        full_filter = ";".join(filter_parts)
        
        # Build FFmpeg command for subtitle burning with compatibility
        cmd = [
            self.ffmpeg_path, "-y"
        ]
        
        # Auto hardware acceleration for subtitle processing
        if self.hardware_codec and self.gpu_type == "nvidia":
            cmd.extend(["-hwaccel", "auto"])
            print("🚀 Auto Hardware Acceleration for subtitle burning")
        
        cmd.extend(["-i", temp_video])

        # Add visualizer video input if present
        if viz_input_args:
            cmd.extend(viz_input_args)

        # Add logo inputs if needed (GIF ignore_loop already added per input)
        if logo_input_args:
            cmd.extend(logo_input_args)
        
        # Debug: Print full FFmpeg command
        if filter_parts:
            print(f"[VideoGen] Filter complex: {full_filter}")
        
        # Add filter — always use -filter_complex now
        cmd.extend(["-filter_complex", full_filter, "-map", video_out_label, "-map", "0:a"])
        cmd.extend(["-c:a", DEFAULT_AUDIO_CODEC, "-b:a", DEFAULT_AUDIO_BITRATE])
        
        # Add video codec settings with NVENC optimization
        if output_format == "webm":
            cmd.extend(["-c:v", "libvpx-vp9"])
        elif output_format == "mov":
            cmd.extend(["-c:v", "prores_ks", "-profile:v", "4444"])
        else:  # mp4 - NVENC optimized for subtitle burn-in
            if self.hardware_codec and self.gpu_type == "nvidia":
                cmd.extend(["-c:v", "h264_nvenc"])
                cmd.extend(["-preset", "fast"])
                cmd.extend(["-cq", "20"])  # High quality for subtitle clarity
            else:
                cmd.extend(["-c:v", DEFAULT_VIDEO_CODEC])
        
        cmd.append(output_path)

        # Debug: Print full FFmpeg command
        print(f"[VideoGen] FFmpeg command: {' '.join(cmd)}")
        
        if progress_callback:
            progress_callback(60, "Burning subtitles...")
        
        # Run FFmpeg with progress tracking
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding='utf-8',
            errors='replace'
        )
        
        # Parse stderr for progress (FFmpeg outputs time= field)
        import re as _re
        total_duration = result.get("duration", 0)
        stderr_lines = []
        for line in process.stderr:
            stderr_lines.append(line)
            if total_duration > 0 and "time=" in line:
                time_match = _re.search(r"time=(\d+):(\d+):(\d+)\.(\d+)", line)
                if time_match:
                    h, m, s, cs = map(int, time_match.groups())
                    current_time = h * 3600 + m * 60 + s + cs / 100
                    burn_progress = min(1.0, current_time / total_duration)
                    scaled = 60 + int(burn_progress * 35)
                    if progress_callback:
                        progress_callback(scaled, "Burning subtitles...")

            # Check for cancellation
            if cancel_check and cancel_check():
                process.kill()
                process.wait()
                try:
                    os.remove(temp_video)
                except Exception:
                    pass
                try:
                    os.remove(output_path)
                except Exception:
                    pass
                raise RuntimeError("Render cancelled")
        
        process.wait()
        stderr = "".join(stderr_lines)
        
        # Clean up temp file
        try:
            os.remove(temp_video)
        except:
            pass
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg subtitle burn failed: {stderr}")

        if progress_callback:
            progress_callback(100, "Complete!")
        
        result["output_path"] = output_path
        result["subtitle_path"] = subtitle_path
        
        return result


# Singleton instance
_video_generator = None

def get_video_generator() -> VideoGenerator:
    """Get or create the video generator singleton"""
    global _video_generator
    if _video_generator is None:
        _video_generator = VideoGenerator()
    return _video_generator
