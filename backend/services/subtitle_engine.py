"""
Subtitle Engine
Generates ASS/SSA subtitle files with professional styling and animations
"""
import os
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field, replace as dc_replace
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent))
from config import (
    DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_FONT_COLOR,
    DEFAULT_BORDER_COLOR, DEFAULT_BORDER_WIDTH, DEFAULT_SHADOW_DEPTH,
    VIDEO_FORMATS, FONTS_DIR
)


@dataclass
class SubtitleStyle:
    """Subtitle style configuration"""
    name: str = "Default"
    font_name: str = DEFAULT_FONT
    font_size: int = DEFAULT_FONT_SIZE
    primary_color: str = DEFAULT_FONT_COLOR  # Hex format
    secondary_color: str = "#FFFF00"
    border_color: str = DEFAULT_BORDER_COLOR
    shadow_color: str = "#000000"
    bold: bool = False
    italic: bool = False
    underline: bool = False
    border_width: float = DEFAULT_BORDER_WIDTH
    shadow_depth: float = DEFAULT_SHADOW_DEPTH
    alignment: int = 2  # 1-9 numpad style (2 = bottom center)
    margin_left: int = 20      # Increased for 4K (2x of 1080p)
    margin_right: int = 20     # Increased for 4K (2x of 1080p)
    margin_vertical: int = 60  # Increased for 4K (2x of 1080p)
    offset_x: int = 0  # Horizontal fine adjustment (pixels)
    offset_y: int = 0  # Vertical fine adjustment (pixels)
    blur: float = 0
    
    def to_ass_color(self, hex_color: str, alpha: int = 0) -> str:
        """Convert hex color to ASS format (&HAABBGGRR)"""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
            return f"&H{alpha:02X}{b}{g}{r}"
        return f"&H00FFFFFF"
    
    def to_ass_style_line(self) -> str:
        """Generate ASS style line"""
        return (
            f"Style: {self.name},"
            f"{self.font_name},"
            f"{self.font_size},"
            f"{self.to_ass_color(self.primary_color)},"
            f"{self.to_ass_color(self.secondary_color)},"
            f"{self.to_ass_color(self.border_color)},"
            f"{self.to_ass_color(self.shadow_color, 128)},"
            f"{int(self.bold) * -1},"
            f"{int(self.italic) * -1},"
            f"{int(self.underline) * -1},"
            f"0,"  # StrikeOut
            f"100,100,"  # ScaleX, ScaleY
            f"0,"  # Spacing
            f"0,"  # Angle
            f"1,"  # BorderStyle (1 = outline + shadow)
            f"{self.border_width},"
            f"{self.shadow_depth},"
            f"{self.alignment},"
            f"{max(0, self.margin_left + self.offset_x)},{max(0, self.margin_right - self.offset_x)},{max(0, self.margin_vertical + self.offset_y)},"
            f"1"  # Encoding
        )


@dataclass
class AnimationConfig:
    """Animation configuration for subtitles - optimized for 4K performance"""
    type: str = "none"  # none, fade, karaoke, typewriter, word_highlight, pop
    fade_in: int = 0  # milliseconds
    fade_out: int = 0
    karaoke_type: str = "instant"  # instant (fast), sweep (slower), border (slowest)
    highlight_color: str = "#FFFF00"
    rtl: bool = False  # Right-to-left language support (Arabic, Hebrew, etc.)
    
    
class SubtitleEngine:
    """Engine for generating professional subtitle files"""
    
    def __init__(self, video_width: int = 1920, video_height: int = 1080):
        self.video_width = video_width
        self.video_height = video_height
        self.styles: Dict[str, SubtitleStyle] = {}
        self.default_style = SubtitleStyle()
        self.styles["Default"] = self.default_style
        
    def set_resolution(self, width: int, height: int):
        """Set video resolution"""
        self.video_width = width
        self.video_height = height
    
    def set_resolution_from_format(self, format_type: str):
        """Set resolution from format type"""
        config = VIDEO_FORMATS.get(format_type, VIDEO_FORMATS["horizontal"])
        self.video_width = config["width"]
        self.video_height = config["height"]
    
    def add_style(self, style: SubtitleStyle):
        """Add a subtitle style"""
        self.styles[style.name] = style
    
    def create_style(self, name: str, **kwargs) -> SubtitleStyle:
        """Create and add a new style"""
        style = SubtitleStyle(name=name, **kwargs)
        self.styles[name] = style
        return style
    
    def _format_time(self, seconds: float) -> str:
        """Format time as ASS timestamp (H:MM:SS.cc)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        centisecs = int((seconds % 1) * 100)
        return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"
    
    @staticmethod
    def _hex_to_ass_color(hex_color: str) -> str:
        """Convert hex color to ASS inline color format (&HBBGGRR&)"""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
            return f"&H{b}{g}{r}&"
        return "&HFFFFFF&"
    
    def _apply_animation(
        self,
        text: str,
        animation: AnimationConfig,
        duration: float,
        words: Optional[List] = None,
        sub_start: float = 0.0
    ) -> str:
        """Apply animation effects to subtitle text"""
        
        print(f"[ANIMATION DEBUG] Type: {animation.type}, Words: {words is not None}, Text: '{text[:50]}...'")
        
        if animation.type == "none":
            return text
        
        if animation.type == "fade":
            return f"{{\\fad({animation.fade_in},{animation.fade_out})}}{text}"
        
        if animation.type == "pop":
            # Scale animation
            return (
                f"{{\\fscx0\\fscy0\\t(0,200,\\fscx100\\fscy100)"
                f"\\t({int(duration*1000)-200},{int(duration*1000)},\\fscx0\\fscy0)}}{text}"
            )
        
        if animation.type == "karaoke" and words:
            # Debug karaoke animation
            print(f"[KARAOKE DEBUG] Applying karaoke animation: words={words}, type={type(words)}, karaoke_type={animation.karaoke_type}")
            karaoke_parts = []
            
            # \k = instant (whole word lights up at once)
            # \kf = sweep/fill (color sweeps left-to-right across the word)
            k_tag = "k" if animation.karaoke_type == "instant" else "kf"
            
            word_list = list(words)
            
            # For RTL languages, reverse the word order for karaoke effect
            if animation.rtl:
                word_list = list(reversed(word_list))
            
            # Track cumulative time relative to subtitle start.
            # Each \k/\kf duration covers from the end of the previous syllable
            # to the end of the current syllable (including any gap before it).
            cumulative_cs = 0
            
            for word_data in word_list:
                if isinstance(word_data, dict):
                    word = word_data.get("word", "").strip()
                    word_end = word_data.get("end", 0)
                    word_start = word_data.get("start", 0)
                    # Calculate this word's duration:
                    # From where the previous word ended (cumulative) to this word's end
                    word_end_rel_cs = int((word_end - sub_start) * 100)
                    duration_cs = max(20, word_end_rel_cs - cumulative_cs)
                    cumulative_cs += duration_cs
                else:
                    word = str(word_data).strip()
                    duration_cs = max(20, int((duration / len(words)) * 100))
                    cumulative_cs += duration_cs

                # Ensure trailing space between words
                if word and not word.endswith(' '):
                    word += ' '

                karaoke_parts.append(f"{{\\{k_tag}{duration_cs}}}{word}")
            
            # For RTL, reverse back to get correct visual order
            if animation.rtl:
                karaoke_parts = list(reversed(karaoke_parts))
            
            return "".join(karaoke_parts)
        
        elif animation.type == "karaoke" and not words:
            # FALLBACK: No word data, split text into words
            print(f"[KARAOKE FALLBACK] Creating karaoke without words data for: '{text[:50]}...', karaoke_type={animation.karaoke_type}")

            # \k = instant, \kf = sweep
            k_tag = "k" if animation.karaoke_type == "instant" else "kf"

            # Split text into words — for CJK (Chinese/Japanese/Korean),
            # whitespace splitting yields the whole line as one chunk, so
            # fall back to character-level splitting.
            CJK_RE = re.compile(r'[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]')
            words_list = text.strip().split()
            if len(words_list) <= 1 and CJK_RE.search(text):
                # Split into individual characters for CJK
                words_list = list(text.strip())
            if not words_list:
                return text
            
            karaoke_parts = []
            # Distribute equal duration for each word
            word_duration = duration / len(words_list)
            
            for word in words_list:
                # Minimum 30cs (300ms) per word için optimize et
                duration_cs = max(30, int(word_duration * 100))
                # Kelime sonuna boşluk ekle (son kelime hariç)
                if word != words_list[-1]:
                    word += " "
                karaoke_parts.append(f"{{\\{k_tag}{duration_cs}}}{word}")
            
            fallback_result = "".join(karaoke_parts)
            print(f"[KARAOKE FALLBACK] Generated: {len(words_list)} words with {duration_cs}cs each, tag=\\{k_tag}")
            return fallback_result
        
        if animation.type == "word_highlight" and words:
            # Highlight words one at a time
            return self._create_word_highlight(words, animation)
        
        if animation.type == "typewriter":
            # Character by character reveal
            chars = list(text)
            char_duration = int((duration * 1000) / len(chars))
            typewriter_text = ""
            for i, char in enumerate(chars):
                delay = i * char_duration
                typewriter_text += f"{{\\t({delay},{delay + 50},\\alpha&H00&)}}{char}"
            return f"{{\\alpha&HFF&}}{typewriter_text}"
        
        print(f"[ANIMATION DEBUG] No animation applied for type: {animation.type}, returning original text: '{text[:50]}...'")
        return text
    
    def _create_word_highlight(
        self,
        words: List,
        animation: AnimationConfig
    ) -> str:
        """Create word-by-word highlight effect"""
        # This creates multiple dialogue lines for word highlighting
        # For simplicity, return basic karaoke
        text = ""
        for word_data in words:
            # Handle both dict format and string format for words
            if isinstance(word_data, dict):
                word = word_data.get("word", "")
                duration_cs = int((word_data.get("end", 0) - word_data.get("start", 0)) * 100)
            else:
                # word_data is a string
                word = str(word_data) + " "
                duration_cs = 50  # Default duration for string words
            text += f"{{\\kf{duration_cs}}}{word}"
        return text
    
    def generate_ass(
        self,
        subtitles: List[Dict[str, Any]],
        style: Optional[SubtitleStyle] = None,
        animation: Optional[AnimationConfig] = None,
        title: str = "SubMaker Subtitles"
    ) -> str:
        """
        Generate ASS subtitle file content
        
        Args:
            subtitles: List of subtitle dicts with start, end, text (and optionally words)
            style: Subtitle style to use
            animation: Animation configuration
            title: Script title
            
        Returns:
            ASS file content as string
        """
        if style is None:
            style = self.default_style
        
        if animation is None:
            animation = AnimationConfig()

        # Always use the passed-in style — it carries the user's current settings
        # (alignment, margins, colors, etc.).  Cache it so the [V4+ Styles] section
        # emits the correct style line.
        self.styles[style.name] = style
        self.default_style = style

        # Karaoke color setup — must be AFTER style resolution
        # Use a copy to avoid mutating the cached style across renders
        if animation.type == "karaoke" and style:
            # ASS karaoke: \k/\kf sweeps text from SecondaryColour → PrimaryColour
            # PrimaryColour = color AFTER sweep (already sung) = highlight color (yellow)
            # SecondaryColour = color BEFORE sweep (not yet sung) = original text color
            original_primary = style.primary_color
            style = dc_replace(style,
                primary_color=animation.highlight_color,
                secondary_color=original_primary,
            )
            # Update the style in collection so the ASS style line uses swapped colors
            self.styles[style.name] = style
            print(f"[KARAOKE STYLE] Swapped colors: PrimaryColour={style.primary_color} (sung), SecondaryColour={style.secondary_color} (not-yet-sung), highlight={animation.highlight_color}")
        
        # Build ASS content
        ass_content = f"""[Script Info]
Title: {title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: {self.video_width}
PlayResY: {self.video_height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
"""
        
        # Add all styles
        for s in self.styles.values():
            ass_content += s.to_ass_style_line() + "\n"
        
        ass_content += """
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        
        # Add dialogue lines
        for sub in subtitles:
            start = self._format_time(sub["start"])
            end = self._format_time(sub["end"])
            text = sub["text"]
            words = sub.get("words")
            duration = sub["end"] - sub["start"]
            
            # Apply animation
            animated_text = self._apply_animation(text, animation, duration, words, sub["start"])
            
            # Escape special characters
            animated_text = animated_text.replace("\n", "\\N")
            
            ass_content += f"Dialogue: 0,{start},{end},{style.name},,0,0,0,,{animated_text}\n"
        
        return ass_content
    
    def generate_srt(self, subtitles: List[Dict[str, Any]]) -> str:
        """
        Generate SRT subtitle file content
        
        Args:
            subtitles: List of subtitle dicts
            
        Returns:
            SRT file content as string
        """
        srt_content = ""
        
        for i, sub in enumerate(subtitles, 1):
            start = self._format_srt_time(sub["start"])
            end = self._format_srt_time(sub["end"])
            text = sub["text"]
            
            srt_content += f"{i}\n{start} --> {end}\n{text}\n\n"
        
        return srt_content
    
    def _format_srt_time(self, seconds: float) -> str:
        """Format time as SRT timestamp (HH:MM:SS,mmm)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
    
    def save_ass(
        self,
        subtitles: List[Dict[str, Any]],
        output_path: str,
        style: Optional[SubtitleStyle] = None,
        animation: Optional[AnimationConfig] = None
    ) -> str:
        """
        Generate and save ASS file
        
        Args:
            subtitles: List of subtitles
            output_path: Output file path
            style: Style configuration
            animation: Animation configuration
            
        Returns:
            Path to saved file
        """
        content = self.generate_ass(subtitles, style, animation)
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        return output_path
    
    def save_srt(
        self,
        subtitles: List[Dict[str, Any]],
        output_path: str
    ) -> str:
        """
        Generate and save SRT file
        
        Args:
            subtitles: List of subtitles
            output_path: Output file path
            
        Returns:
            Path to saved file
        """
        content = self.generate_srt(subtitles)
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        return output_path
    
    def generate_ass_dual(
        self,
        primary_subtitles: List[Dict[str, Any]],
        secondary_subtitles: List[Dict[str, Any]],
        primary_style: Optional[SubtitleStyle] = None,
        secondary_style: Optional[SubtitleStyle] = None,
        animation: Optional[AnimationConfig] = None,
        title: str = "SubMaker Dual Subtitles"
    ) -> str:
        """
        Generate ASS subtitle file with dual language support
        
        Args:
            primary_subtitles: Primary language subtitles
            secondary_subtitles: Secondary (translated) subtitles
            primary_style: Primary subtitle style
            secondary_style: Secondary subtitle style
            animation: Animation configuration
            title: Script title
            
        Returns:
            ASS file content as string
        """
        if primary_style is None:
            primary_style = self.default_style
        
        if secondary_style is None:
            # Create a default secondary style (yellow, smaller, below primary)
            secondary_style = SubtitleStyle(
                name="Secondary",
                font_name=primary_style.font_name,
                font_size=int(primary_style.font_size * 0.75),  # 75% of primary
                primary_color="#FFFF00",  # Yellow
                border_color="#000000",
                border_width=primary_style.border_width,
                shadow_depth=primary_style.shadow_depth,
                alignment=2,  # Bottom center
                margin_vertical=primary_style.margin_vertical + 120,  # Below primary (increased for 4K)
            )
        else:
            secondary_style.name = "Secondary"
        
        if animation is None:
            animation = AnimationConfig()
        
        # Cache original styles before karaoke swap
        self.styles[primary_style.name] = primary_style
        self.styles[secondary_style.name] = secondary_style

        # Anti-overlap: ensure secondary margin doesn't collide with primary
        pri_zone = 'bottom' if primary_style.alignment <= 3 else 'middle' if primary_style.alignment <= 6 else 'top'
        sec_zone = 'bottom' if secondary_style.alignment <= 3 else 'middle' if secondary_style.alignment <= 6 else 'top'
        if pri_zone == sec_zone and pri_zone in ('bottom', 'top'):
            container_w = self.video_width - 2 * max(primary_style.margin_left, 20)
            avg_char_w = primary_style.font_size * 0.55
            chars_per_line = max(1, int(container_w / avg_char_w))
            # Estimate max line count from all primary subtitles
            max_lines = 1
            for s in primary_subtitles:
                txt = s.get('text', '')
                est = max(1, -(-len(txt) // chars_per_line))  # ceil division
                if est > max_lines:
                    max_lines = est
            max_lines = min(max_lines, 3)  # cap at 3 lines
            pri_height = primary_style.font_size * 1.2 * max_lines
            gap = primary_style.font_size * 0.5
            pri_margin = primary_style.margin_vertical + primary_style.offset_y
            min_sec_margin = pri_margin + pri_height + gap
            if secondary_style.margin_vertical < min_sec_margin:
                secondary_style = dc_replace(secondary_style,
                    margin_vertical=int(min_sec_margin)
                )
                self.styles[secondary_style.name] = secondary_style
        
        # Karaoke color setup for primary style (copy to avoid mutation)
        if animation.type == "karaoke" and primary_style:
            original_primary = primary_style.primary_color
            primary_style = dc_replace(primary_style,
                primary_color=animation.highlight_color,
                secondary_color=original_primary,
            )
            # Update collection so the ASS style line uses swapped colors
            self.styles[primary_style.name] = primary_style
        
        # Build ASS content
        ass_content = f"""[Script Info]
Title: {title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: {self.video_width}
PlayResY: {self.video_height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
"""
        
        # Add both styles
        ass_content += primary_style.to_ass_style_line() + "\n"
        ass_content += secondary_style.to_ass_style_line() + "\n"
        
        ass_content += """
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        
        # Create a lookup for secondary subtitles by ID
        secondary_by_id = {sub.get('id'): sub for sub in secondary_subtitles}
        
        # Add dialogue lines - primary first, then secondary
        for sub in primary_subtitles:
            start = self._format_time(sub["start"])
            end = self._format_time(sub["end"])
            text = sub["text"]
            words = sub.get("words")
            duration = sub["end"] - sub["start"]
            
            # Apply animation to primary
            animated_text = self._apply_animation(text, animation, duration, words)
            animated_text = animated_text.replace("\n", "\\N")
            
            # Add primary dialogue
            ass_content += f"Dialogue: 0,{start},{end},{primary_style.name},,0,0,0,,{animated_text}\n"
            
            # Add secondary dialogue if exists
            sub_id = sub.get('id')
            if sub_id and sub_id in secondary_by_id:
                secondary_sub = secondary_by_id[sub_id]
                secondary_text = secondary_sub.get('translatedText', '')
                if secondary_text:
                    # Secondary has simple fade animation
                    secondary_animated = f"{{\\fad(150,150)}}{secondary_text}"
                    secondary_animated = secondary_animated.replace("\n", "\\N")
                    ass_content += f"Dialogue: 1,{start},{end},{secondary_style.name},,0,0,0,,{secondary_animated}\n"
        
        return ass_content
    
    # ==================== LRC Format ====================

    def generate_lrc(self, subtitles: List[Dict[str, Any]], metadata: Optional[Dict] = None) -> str:
        """
        Generate standard LRC file with line-level timestamps.
        Format: [mm:ss.xx] Line text
        """
        lines = []

        # LRC metadata header
        if metadata:
            if "title" in metadata:
                lines.append(f"[ti:{metadata['title']}]")
            if "artist" in metadata:
                lines.append(f"[ar:{metadata['artist']}]")
            if "album" in metadata:
                lines.append(f"[al:{metadata['album']}]")
        lines.append("[by:SubMaker]")
        lines.append("")

        for sub in subtitles:
            timestamp = self._format_lrc_time(sub["start"])
            text = sub.get("text", "").strip()
            if text:
                lines.append(f"[{timestamp}]{text}")

        return "\n".join(lines) + "\n"

    def generate_enhanced_lrc(self, subtitles: List[Dict[str, Any]], metadata: Optional[Dict] = None) -> str:
        """
        Generate Enhanced LRC with word-level timestamps.
        Format: [mm:ss.xx] <mm:ss.xx> word1 <mm:ss.xx> word2 ...
        """
        lines = []

        # LRC metadata header
        if metadata:
            if "title" in metadata:
                lines.append(f"[ti:{metadata['title']}]")
            if "artist" in metadata:
                lines.append(f"[ar:{metadata['artist']}]")
            if "album" in metadata:
                lines.append(f"[al:{metadata['album']}]")
        lines.append("[by:SubMaker]")
        lines.append("")

        for sub in subtitles:
            line_timestamp = self._format_lrc_time(sub["start"])

            if "words" in sub and sub["words"]:
                # Build word-level enhanced LRC line
                word_parts = []
                for word in sub["words"]:
                    word_ts = self._format_lrc_time(word["start"])
                    word_text = word.get("word", "").strip()
                    if word_text:
                        word_parts.append(f"<{word_ts}>{word_text}")

                if word_parts:
                    lines.append(f"[{line_timestamp}]{' '.join(word_parts)}")
            else:
                # Fallback to line-level
                text = sub.get("text", "").strip()
                if text:
                    lines.append(f"[{line_timestamp}]{text}")

        return "\n".join(lines) + "\n"

    def generate_word_level_json(self, subtitles: List[Dict[str, Any]]) -> str:
        """
        Generate JSON with word-level timestamps for video automation pipeline.

        Returns JSON string:
        {
            "words": [{"word": "hello", "start": 0.120, "end": 0.450, "probability": 0.98}, ...],
            "lines": [{"id": 1, "start": 0.120, "end": 1.500, "text": "hello world", "words": [...]}, ...]
        }
        """
        import json

        all_words = []
        all_lines = []

        for i, sub in enumerate(subtitles, 1):
            line_data = {
                "id": i,
                "start": sub["start"],
                "end": sub["end"],
                "text": sub.get("text", "").strip()
            }

            if "words" in sub and sub["words"]:
                line_data["words"] = sub["words"]
                all_words.extend(sub["words"])

            all_lines.append(line_data)

        output = {
            "words": all_words,
            "lines": all_lines
        }

        return json.dumps(output, ensure_ascii=False, indent=2)

    def _format_lrc_time(self, seconds: float) -> str:
        """Format time as LRC timestamp mm:ss.xx"""
        minutes = int(seconds // 60)
        secs = seconds % 60
        return f"{minutes:02d}:{secs:05.2f}"

    def save_lrc(self, subtitles: List[Dict[str, Any]], output_path: str, metadata: Optional[Dict] = None) -> str:
        """Generate and save standard LRC file"""
        content = self.generate_lrc(subtitles, metadata)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
        return output_path

    def save_enhanced_lrc(self, subtitles: List[Dict[str, Any]], output_path: str, metadata: Optional[Dict] = None) -> str:
        """Generate and save Enhanced LRC file with word-level timestamps"""
        content = self.generate_enhanced_lrc(subtitles, metadata)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
        return output_path

    def save_word_level_json(self, subtitles: List[Dict[str, Any]], output_path: str) -> str:
        """Generate and save word-level JSON file"""
        content = self.generate_word_level_json(subtitles)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
        return output_path

    # ==================== Dual Language ====================

    def save_ass_dual(
        self,
        primary_subtitles: List[Dict[str, Any]],
        secondary_subtitles: List[Dict[str, Any]],
        output_path: str,
        primary_style: Optional[SubtitleStyle] = None,
        secondary_style: Optional[SubtitleStyle] = None,
        animation: Optional[AnimationConfig] = None
    ) -> str:
        """
        Generate and save dual language ASS file
        """
        content = self.generate_ass_dual(
            primary_subtitles,
            secondary_subtitles,
            primary_style,
            secondary_style,
            animation
        )
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        return output_path


# Singleton instance
_subtitle_engine = None

def get_subtitle_engine(fresh: bool = False) -> SubtitleEngine:
    """Get or create the subtitle engine singleton
    
    Args:
        fresh: If True, create a new instance (for render jobs to avoid cached styles)
    """
    global _subtitle_engine
    if fresh or _subtitle_engine is None:
        _subtitle_engine = SubtitleEngine()
    return _subtitle_engine
