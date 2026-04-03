"""
Suno Lyrics Parser
Parses Suno format lyrics into subtitle segments with timing information.
"""

import re
import json
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

@dataclass
class LyricSegment:
    """Represents a single lyric segment"""
    start_time: float
    end_time: float
    text: str
    type: str  # 'section', 'verse', 'citation', 'bridge', 'intro', 'outro'
    metadata: Dict = None
    
    def to_subtitle_format(self) -> Dict:
        """Converts to subtitle format"""
        return {
            'start': self.start_time,
            'end': self.end_time,
            'text': self.text,
            'type': self.type,
            'metadata': self.metadata or {}
        }

class SunoLyricsParser:
    """Main class for parsing Suno format lyrics into subtitle segments"""
    
    def __init__(self):
        # Default timing configuration
        self.default_timings = {
            'intro_duration': 3.0,
            'section_duration': 4.0,
            'verse_duration': 3.0,
            'citation_duration': 4.0,
            'pause_duration': 1.0,
            'bridge_duration': 3.5,
            'outro_duration': 4.0,
            'line_gap': 0.5,
            'words_per_second': 2.5
        }
        
        # Regex patterns for parsing
        self.patterns = {
            'section': r'\[([^\]]+)\]',
            'citation': r'\[cite_start\]([^[]+?)(?=\[|\Z)',
            'pause': r'\[pause\]',
            'parenthetical': r'\(([^)]+)\)',
            'metadata': r'\(([^)]+(?:Voice|Silence|Bridge)[^)]*)\)'
        }
    
    def parse_lyrics(self, lyrics_text: str, base_start_time: float = 0.0) -> List[LyricSegment]:
        """
        Parse Suno lyrics text and return list of segments
        
        Args:
            lyrics_text: Raw lyrics text
            base_start_time: Start time in seconds
            
        Returns:
            List of LyricSegment objects
        """
        segments = []
        current_time = base_start_time
        
        # Split text into lines
        lines = lyrics_text.strip().split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            segment = self._parse_line(line, current_time)
            if segment:
                segments.append(segment)
                current_time = segment.end_time + self.default_timings['line_gap']
        
        return segments
    
    def _parse_line(self, line: str, start_time: float) -> Optional[LyricSegment]:
        """Parse a single line of lyrics"""
        
        # Section headers like [Intro], [Section 1: El-Huda / Rehber] etc.
        section_match = re.search(self.patterns['section'], line)
        if section_match:
            section_text = section_match.group(1)
            duration = self._calculate_section_duration(section_text)
            
            # Clean metadata from section text
            clean_text = re.sub(self.patterns['parenthetical'], '', section_text).strip()
            metadata = self._extract_metadata(line)
            
            return LyricSegment(
                start_time=start_time,
                end_time=start_time + duration,
                text=clean_text,
                type=self._determine_section_type(section_text),
                metadata=metadata
            )
        
        # Citation (marked with cite_start)
        citation_match = re.search(self.patterns['citation'], line)
        if citation_match:
            citation_text = citation_match.group(1).strip()
            duration = self._calculate_text_duration(citation_text)
            
            return LyricSegment(
                start_time=start_time,
                end_time=start_time + duration,
                text=citation_text,
                type='citation',
                metadata={'is_citation': True, 'language': self._detect_language(citation_text)}
            )
        
        # Skip pause markers
        if '[pause]' in line:
            return LyricSegment(
                start_time=start_time,
                end_time=start_time + self.default_timings['pause_duration'],
                text='[pause]',
                type='pause',
                metadata={'is_pause': True}
            )
        
        # Normal text lines
        if line and not line.startswith('['):
            # Clean parenthetical notes
            clean_text = re.sub(self.patterns['parenthetical'], '', line).strip()
            if clean_text:
                duration = self._calculate_text_duration(clean_text)
                metadata = self._extract_metadata(line)
                
                return LyricSegment(
                    start_time=start_time,
                    end_time=start_time + duration,
                    text=clean_text,
                    type='verse',
                    metadata=metadata
                )
        
        return None
    
    def _calculate_section_duration(self, section_text: str) -> float:
        """Calculate duration for section headers"""
        if 'intro' in section_text.lower():
            return self.default_timings['intro_duration']
        elif 'outro' in section_text.lower():
            return self.default_timings['outro_duration']
        elif 'bridge' in section_text.lower():
            return self.default_timings['bridge_duration']
        else:
            return self.default_timings['section_duration']
    
    def _calculate_text_duration(self, text: str) -> float:
        """Calculate duration based on text length
        
        Uses average words per second to estimate duration,
        with longer duration for Arabic text.
        """
        # Count words
        words = len(text.split())
        # Use longer duration for Arabic text
        if self._contains_arabic(text):
            duration = words / (self.default_timings['words_per_second'] * 0.8)
        else:
            duration = words / self.default_timings['words_per_second']
        
        # Minimum 1 second duration
        return max(duration, 1.0)
    
    def _determine_section_type(self, section_text: str) -> str:
        """Determine section type from text"""
        text_lower = section_text.lower()
        if 'intro' in text_lower:
            return 'intro'
        elif 'outro' in text_lower:
            return 'outro'
        elif 'bridge' in text_lower:
            return 'bridge'
        elif 'section' in text_lower:
            return 'section'
        else:
            return 'section'
    
    def _extract_metadata(self, line: str) -> Dict:
        """Extract metadata from line"""
        metadata = {}
        
        # Find parenthetical notes
        parenthetical_matches = re.findall(self.patterns['parenthetical'], line)
        for match in parenthetical_matches:
            if 'voice' in match.lower():
                metadata['voice_note'] = match
            elif any(word in match.lower() for word in ['ambient', 'peaceful', 'softly', 'whispering']):
                metadata['mood'] = match
            elif any(word in match.lower() for word in ['edebi', 'şiirsel', 'poetic', 'literary']):
                metadata['style'] = match
        
        return metadata
    
    def _detect_language(self, text: str) -> str:
        """Simple language detection based on character set"""
        if self._contains_arabic(text):
            return 'ar'
        elif self._contains_turkish(text):
            return 'tr'
        else:
            return 'unknown'
    
    def _contains_arabic(self, text: str) -> bool:
        """Check if text contains Arabic characters"""
        arabic_pattern = r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
        return bool(re.search(arabic_pattern, text))
    
    def _contains_turkish(self, text: str) -> bool:
        """Check if text contains Turkish characters"""
        turkish_chars = 'çğıöşüÇĞIÖŞÜ'
        return any(char in text for char in turkish_chars)
    
    def adjust_timings(self, segments: List[LyricSegment], total_duration: Optional[float] = None) -> List[LyricSegment]:
        """
        Adjust segment timings to normalize total duration
        
        Args:
            segments: List of LyricSegment objects
            total_duration: Target total duration in seconds
            
        Returns:
            Adjusted list of segments
        """
        if not segments or not total_duration:
            return segments
        
        # Get current total duration
        current_total = max(seg.end_time for seg in segments) if segments else 0
        
        if current_total <= 0:
            return segments
        
        # Calculate scale factor
        scale_factor = total_duration / current_total
        
        # Scale all timings
        adjusted_segments = []
        for segment in segments:
            adjusted_segment = LyricSegment(
                start_time=segment.start_time * scale_factor,
                end_time=segment.end_time * scale_factor,
                text=segment.text,
                type=segment.type,
                metadata=segment.metadata
            )
            adjusted_segments.append(adjusted_segment)
        
        return adjusted_segments
    
    def export_to_subtitle_format(self, segments: List[LyricSegment]) -> List[Dict]:
        """Convert segments to subtitle format"""
        return [segment.to_subtitle_format() for segment in segments]
    
    def parse_and_export(self, lyrics_text: str, total_duration: Optional[float] = None) -> List[Dict]:
        """
        Full parsing and export process - parse text and return in subtitle format
        
        Args:
            lyrics_text: Raw lyrics text
            total_duration: Target total duration
            
        Returns:
            List of segments in subtitle format
        """
        # Parse lyrics
        segments = self.parse_lyrics(lyrics_text)
        
        # Adjust timings if needed
        if total_duration:
            segments = self.adjust_timings(segments, total_duration)
        
        # Convert to subtitle format
        return self.export_to_subtitle_format(segments)

def parse_suno_lyrics(lyrics_text: str, total_duration: Optional[float] = None) -> List[Dict]:
    """
    Convenience function - Parse Suno format lyrics
    
    Args:
        lyrics_text: Raw lyrics text
        total_duration: Target total duration in seconds
        
    Returns:
        List of segments in subtitle format
    """
    parser = SunoLyricsParser()
    return parser.parse_and_export(lyrics_text, total_duration)