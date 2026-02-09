"""
Suno Lyrics Parser
Suno'dan gelen lirik metinlerini parse ederek subtitle formatına çevirir.
"""

import re
import json
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

@dataclass
class LyricSegment:
    """Tek bir lirik segmentini temsil eder"""
    start_time: float
    end_time: float
    text: str
    type: str  # 'section', 'verse', 'citation', 'bridge', 'intro', 'outro'
    metadata: Dict = None
    
    def to_subtitle_format(self) -> Dict:
        """Subtitle formatına çevirir"""
        return {
            'start': self.start_time,
            'end': self.end_time,
            'text': self.text,
            'type': self.type,
            'metadata': self.metadata or {}
        }

class SunoLyricsParser:
    """Suno lirik metinlerini parse eden ana sınıf"""
    
    def __init__(self):
        # Varsayılan timing ayarları
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
        
        # Pattern'lar
        self.patterns = {
            'section': r'\[([^\]]+)\]',
            'citation': r'\[cite_start\]([^[]+?)(?=\[|\Z)',
            'pause': r'\[pause\]',
            'parenthetical': r'\(([^)]+)\)',
            'metadata': r'\(([^)]+(?:Voice|Silence|Bridge)[^)]*)\)'
        }
    
    def parse_lyrics(self, lyrics_text: str, base_start_time: float = 0.0) -> List[LyricSegment]:
        """
        Suno lirik metnini parse ederek segment listesi döndürür
        
        Args:
            lyrics_text: Ham lirik metni
            base_start_time: Başlangıç zamanı
            
        Returns:
            LyricSegment listesi
        """
        segments = []
        current_time = base_start_time
        
        # Metni satırlara böl
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
        """Tek satırı parse eder"""
        
        # Section başlıkları [Intro], [Section 1: El-Huda / Rehber] vb.
        section_match = re.search(self.patterns['section'], line)
        if section_match:
            section_text = section_match.group(1)
            duration = self._calculate_section_duration(section_text)
            
            # Metadata'yı temizle
            clean_text = re.sub(self.patterns['parenthetical'], '', section_text).strip()
            metadata = self._extract_metadata(line)
            
            return LyricSegment(
                start_time=start_time,
                end_time=start_time + duration,
                text=clean_text,
                type=self._determine_section_type(section_text),
                metadata=metadata
            )
        
        # Citation (cite_start ile işaretli metinler)
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
        
        # Pause etiketlerini atla
        if '[pause]' in line:
            return LyricSegment(
                start_time=start_time,
                end_time=start_time + self.default_timings['pause_duration'],
                text='[pause]',
                type='pause',
                metadata={'is_pause': True}
            )
        
        # Normal metin satırları
        if line and not line.startswith('['):
            # Parenthetical notları temizle
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
        """Section başlığının süresini hesaplar"""
        if 'intro' in section_text.lower():
            return self.default_timings['intro_duration']
        elif 'outro' in section_text.lower():
            return self.default_timings['outro_duration']
        elif 'bridge' in section_text.lower():
            return self.default_timings['bridge_duration']
        else:
            return self.default_timings['section_duration']
    
    def _calculate_text_duration(self, text: str) -> float:
        """Metin uzunluğuna göre süre hesaplar"""
        # Kelime sayısını hesapla
        words = len(text.split())
        # Arapça karakterler için daha uzun süre
        if self._contains_arabic(text):
            duration = words / (self.default_timings['words_per_second'] * 0.8)
        else:
            duration = words / self.default_timings['words_per_second']
        
        # Minimum süre 1 saniye
        return max(duration, 1.0)
    
    def _determine_section_type(self, section_text: str) -> str:
        """Section tipini belirler"""
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
        """Satırdan metadata çıkarır"""
        metadata = {}
        
        # Parenthetical notları bul
        parenthetical_matches = re.findall(self.patterns['parenthetical'], line)
        for match in parenthetical_matches:
            if 'voice' in match.lower():
                metadata['voice_note'] = match
            elif any(word in match.lower() for word in ['ambient', 'peaceful', 'softly', 'whispering']):
                metadata['mood'] = match
            elif 'edebi' in match.lower() or 'şiirsel' in match.lower():
                metadata['style'] = match
        
        return metadata
    
    def _detect_language(self, text: str) -> str:
        """Basit dil tespiti"""
        if self._contains_arabic(text):
            return 'ar'
        elif self._contains_turkish(text):
            return 'tr'
        else:
            return 'unknown'
    
    def _contains_arabic(self, text: str) -> bool:
        """Arapça karakter içeriyor mu kontrol eder"""
        arabic_pattern = r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
        return bool(re.search(arabic_pattern, text))
    
    def _contains_turkish(self, text: str) -> bool:
        """Türkçe karakter içeriyor mu kontrol eder"""
        turkish_chars = 'çğıöşüÇĞIÖŞÜ'
        return any(char in text for char in turkish_chars)
    
    def adjust_timings(self, segments: List[LyricSegment], total_duration: Optional[float] = None) -> List[LyricSegment]:
        """
        Segment timinglerini ayarlar - toplam süreye göre normalize eder
        
        Args:
            segments: LyricSegment listesi
            total_duration: Hedef toplam süre (saniye)
            
        Returns:
            Ayarlanmış segment listesi
        """
        if not segments or not total_duration:
            return segments
        
        # Mevcut toplam süre
        current_total = max(seg.end_time for seg in segments) if segments else 0
        
        if current_total <= 0:
            return segments
        
        # Scale factor hesapla
        scale_factor = total_duration / current_total
        
        # Tüm zamanları ölçekle
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
        """Segment listesini subtitle formatına çevirir"""
        return [segment.to_subtitle_format() for segment in segments]
    
    def parse_and_export(self, lyrics_text: str, total_duration: Optional[float] = None) -> List[Dict]:
        """
        Tam parsing işlemi - metni parse edip subtitle formatında döndürür
        
        Args:
            lyrics_text: Ham lirik metni
            total_duration: Hedef toplam süre
            
        Returns:
            Subtitle formatında segment listesi
        """
        # Parse et
        segments = self.parse_lyrics(lyrics_text)
        
        # Timing'leri ayarla
        if total_duration:
            segments = self.adjust_timings(segments, total_duration)
        
        # Subtitle formatına çevir
        return self.export_to_subtitle_format(segments)

def parse_suno_lyrics(lyrics_text: str, total_duration: Optional[float] = None) -> List[Dict]:
    """
    Convenience function - Suno liriklerini parse eder
    
    Args:
        lyrics_text: Ham lirik metni
        total_duration: Hedef toplam süre (saniye)
        
    Returns:
        Subtitle formatında segment listesi
    """
    parser = SunoLyricsParser()
    return parser.parse_and_export(lyrics_text, total_duration)