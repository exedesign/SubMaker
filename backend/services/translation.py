"""
Translation Service using Argos Translate
Provides offline translation between languages
"""
import os
from typing import List, Dict, Any, Optional
from pathlib import Path

try:
    import argostranslate.package
    import argostranslate.translate
    ARGOS_AVAILABLE = True
except ImportError:
    ARGOS_AVAILABLE = False

import sys
sys.path.append(str(Path(__file__).parent.parent))
from config import RESOURCES_DIR


class TranslationService:
    """Service for translating text between languages using Argos Translate"""
    
    def __init__(self):
        self.installed_languages = set()
        self._initialized = False
        
    def initialize(self) -> bool:
        """Initialize Argos Translate and update package index"""
        if not ARGOS_AVAILABLE:
            raise ImportError(
                "argostranslate is not installed. "
                "Please run: pip install argostranslate"
            )
        
        if self._initialized:
            return True
            
        print("Initializing Argos Translate...")
        argostranslate.package.update_package_index()
        self._update_installed_languages()
        self._initialized = True
        print("Argos Translate initialized!")
        return True
    
    def _update_installed_languages(self):
        """Update the set of installed language pairs"""
        installed = argostranslate.package.get_installed_packages()
        self.installed_languages = {
            (pkg.from_code, pkg.to_code) for pkg in installed
        }
    
    def get_available_packages(self) -> List[Dict[str, str]]:
        """Get list of available language packages"""
        self.initialize()
        available = argostranslate.package.get_available_packages()
        return [
            {
                "from_code": pkg.from_code,
                "from_name": pkg.from_name,
                "to_code": pkg.to_code,
                "to_name": pkg.to_name,
                "installed": (pkg.from_code, pkg.to_code) in self.installed_languages
            }
            for pkg in available
        ]
    
    def get_installed_packages(self) -> List[Dict[str, str]]:
        """Get list of installed language packages"""
        self.initialize()
        installed = argostranslate.package.get_installed_packages()
        return [
            {
                "from_code": pkg.from_code,
                "from_name": pkg.from_name,
                "to_code": pkg.to_code,
                "to_name": pkg.to_name
            }
            for pkg in installed
        ]
    
    def install_language_pair(
        self,
        from_code: str,
        to_code: str,
        progress_callback: Optional[callable] = None
    ) -> bool:
        """
        Install a language pair for translation
        
        Args:
            from_code: Source language code (e.g., 'en')
            to_code: Target language code (e.g., 'ar')
            progress_callback: Optional progress callback
            
        Returns:
            True if installation successful
        """
        self.initialize()
        
        # Check if already installed
        if (from_code, to_code) in self.installed_languages:
            print(f"Language pair {from_code} -> {to_code} already installed")
            return True
        
        # Find the package
        available = argostranslate.package.get_available_packages()
        package = next(
            (pkg for pkg in available 
             if pkg.from_code == from_code and pkg.to_code == to_code),
            None
        )
        
        if package is None:
            raise ValueError(
                f"Language pair {from_code} -> {to_code} not available"
            )
        
        print(f"Downloading language pack: {from_code} -> {to_code}...")
        if progress_callback:
            progress_callback(10, "Downloading...")
            
        download_path = package.download()
        
        if progress_callback:
            progress_callback(70, "Installing...")
            
        argostranslate.package.install_from_path(download_path)
        
        self._update_installed_languages()
        
        if progress_callback:
            progress_callback(100, "Complete!")
            
        print(f"Language pack installed: {from_code} -> {to_code}")
        return True
    
    def translate(
        self,
        text: str,
        from_code: str,
        to_code: str
    ) -> str:
        """
        Translate text from one language to another
        
        Args:
            text: Text to translate
            from_code: Source language code
            to_code: Target language code
            
        Returns:
            Translated text
        """
        self.initialize()
        
        # Check if language pair is installed
        if (from_code, to_code) not in self.installed_languages:
            # Try to install automatically
            try:
                self.install_language_pair(from_code, to_code)
            except Exception as e:
                raise ValueError(
                    f"Language pair {from_code} -> {to_code} not installed "
                    f"and auto-install failed: {e}"
                )
        
        return argostranslate.translate.translate(text, from_code, to_code)
    
    def translate_subtitles(
        self,
        subtitles: List[Dict[str, Any]],
        from_code: str,
        to_code: str,
        progress_callback: Optional[callable] = None
    ) -> List[Dict[str, Any]]:
        """
        Translate a list of subtitle segments
        
        Args:
            subtitles: List of subtitle dicts with 'text' field
            from_code: Source language code
            to_code: Target language code
            progress_callback: Optional progress callback
            
        Returns:
            List of subtitles with translated text
        """
        self.initialize()
        
        # Ensure language pair is installed
        if (from_code, to_code) not in self.installed_languages:
            self.install_language_pair(from_code, to_code)
        
        total = len(subtitles)
        translated = []
        
        for i, subtitle in enumerate(subtitles):
            translated_text = self.translate(
                subtitle["text"],
                from_code,
                to_code
            )
            
            translated_subtitle = subtitle.copy()
            translated_subtitle["text"] = translated_text
            translated_subtitle["original_text"] = subtitle["text"]
            translated.append(translated_subtitle)
            
            if progress_callback:
                progress = int(((i + 1) / total) * 100)
                progress_callback(progress, translated_subtitle)
        
        return translated
    
    def can_translate(self, from_code: str, to_code: str) -> bool:
        """Check if a language pair is available (installed or downloadable)"""
        self.initialize()
        
        if (from_code, to_code) in self.installed_languages:
            return True
            
        available = argostranslate.package.get_available_packages()
        return any(
            pkg.from_code == from_code and pkg.to_code == to_code
            for pkg in available
        )


# Singleton instance
_translation_service = None

def get_translation_service() -> TranslationService:
    """Get or create the translation service singleton"""
    global _translation_service
    if _translation_service is None:
        _translation_service = TranslationService()
    return _translation_service
