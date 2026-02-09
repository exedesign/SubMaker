"""
Arabic Text Processing
Handles RTL text reshaping for proper display in videos
"""
from typing import Optional

try:
    import arabic_reshaper
    RESHAPER_AVAILABLE = True
except ImportError:
    RESHAPER_AVAILABLE = False

try:
    from bidi.algorithm import get_display
    BIDI_AVAILABLE = True
except ImportError:
    BIDI_AVAILABLE = False

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
from config import RTL_LANGUAGES


class ArabicTextProcessor:
    """Processor for Arabic and other RTL languages"""
    
    # RTL language codes
    RTL_CODES = RTL_LANGUAGES
    
    @staticmethod
    def is_available() -> bool:
        """Check if Arabic processing libraries are available"""
        return RESHAPER_AVAILABLE and BIDI_AVAILABLE
    
    @staticmethod
    def is_rtl_language(lang_code: str) -> bool:
        """
        Check if a language code represents an RTL language
        
        Args:
            lang_code: Language code (e.g., 'ar', 'he')
            
        Returns:
            True if RTL language
        """
        return lang_code.lower() in ArabicTextProcessor.RTL_CODES
    
    @staticmethod
    def contains_arabic(text: str) -> bool:
        """
        Check if text contains Arabic characters
        
        Args:
            text: Text to check
            
        Returns:
            True if contains Arabic characters
        """
        for char in text:
            if '\u0600' <= char <= '\u06FF':  # Arabic Unicode block
                return True
            if '\u0750' <= char <= '\u077F':  # Arabic Supplement
                return True
            if '\u08A0' <= char <= '\u08FF':  # Arabic Extended-A
                return True
            if '\uFB50' <= char <= '\uFDFF':  # Arabic Presentation Forms-A
                return True
            if '\uFE70' <= char <= '\uFEFF':  # Arabic Presentation Forms-B
                return True
        return False
    
    @staticmethod
    def reshape_arabic(text: str) -> str:
        """
        Reshape Arabic text for proper glyph connection
        
        Arabic characters change shape based on their position in a word.
        This function ensures characters are properly connected.
        
        Args:
            text: Arabic text to reshape
            
        Returns:
            Reshaped Arabic text
        """
        if not RESHAPER_AVAILABLE:
            raise ImportError(
                "arabic-reshaper is not installed. "
                "Please run: pip install arabic-reshaper"
            )
        
        return arabic_reshaper.reshape(text)
    
    @staticmethod
    def apply_bidi(text: str) -> str:
        """
        Apply BiDi (Bidirectional) algorithm for proper RTL display
        
        This reorders characters for visual display, handling mixed
        RTL and LTR text properly.
        
        Args:
            text: Text to process
            
        Returns:
            Text with proper visual ordering
        """
        if not BIDI_AVAILABLE:
            raise ImportError(
                "python-bidi is not installed. "
                "Please run: pip install python-bidi"
            )
        
        return get_display(text)
    
    @classmethod
    def process_arabic(cls, text: str) -> str:
        """
        Full Arabic text processing pipeline
        
        Applies both reshaping and BiDi algorithm for proper
        display in video subtitles.
        
        Args:
            text: Arabic text to process
            
        Returns:
            Processed text ready for video embedding
        """
        if not cls.is_available():
            raise ImportError(
                "Arabic processing libraries not installed. "
                "Please run: pip install arabic-reshaper python-bidi"
            )
        
        # First reshape the text
        reshaped = cls.reshape_arabic(text)
        
        # Then apply BiDi algorithm
        return cls.apply_bidi(reshaped)
    
    @classmethod
    def process_text(cls, text: str, language: Optional[str] = None) -> str:
        """
        Process text based on language, applying Arabic processing if needed
        
        Args:
            text: Text to process
            language: Language code or None for auto-detection
            
        Returns:
            Processed text
        """
        # Determine if Arabic processing is needed
        needs_processing = False
        
        if language and cls.is_rtl_language(language):
            needs_processing = True
        elif cls.contains_arabic(text):
            needs_processing = True
        
        if needs_processing and cls.is_available():
            return cls.process_arabic(text)
        
        return text
    
    @classmethod
    def process_subtitles(
        cls,
        subtitles: list,
        language: Optional[str] = None
    ) -> list:
        """
        Process a list of subtitle segments for RTL display
        
        Args:
            subtitles: List of subtitle dicts with 'text' field
            language: Language code or None for auto-detection
            
        Returns:
            Processed subtitles
        """
        processed = []
        
        for subtitle in subtitles:
            processed_sub = subtitle.copy()
            processed_sub["text"] = cls.process_text(
                subtitle["text"],
                language
            )
            # Keep original text for reference
            if processed_sub["text"] != subtitle["text"]:
                processed_sub["original_text"] = subtitle["text"]
            processed.append(processed_sub)
        
        return processed


# Convenience function
def process_arabic_text(text: str) -> str:
    """
    Process Arabic text for video display
    
    Convenience function that applies the full processing pipeline.
    
    Args:
        text: Arabic text to process
        
    Returns:
        Processed text ready for video embedding
    """
    return ArabicTextProcessor.process_arabic(text)
