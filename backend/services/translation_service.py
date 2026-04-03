"""
Translation Service for SubMaker
Provides translation functionality using free translation APIs
"""

import requests
import json
from typing import List, Dict, Optional
import urllib.parse

class TranslationService:
    """Service for translating text between languages"""
    
    # Supported languages with their codes
    SUPPORTED_LANGUAGES = {
        'auto': 'Auto Detect',
        'en': 'English',
        'tr': 'Turkish',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'ja': 'Japanese',
        'ko': '한국어',
        'zh': '中文',
        'ar': 'العربية',
        'hi': 'हिन्दी',
        'nl': 'Nederlands',
        'pl': 'Polski',
        'sv': 'Svenska',
        'da': 'Dansk',
        'fi': 'Suomi',
        'no': 'Norsk',
        'cs': 'Čeština',
        'el': 'Ελληνικά',
        'he': 'עברית',
        'th': 'ไทย',
        'vi': 'Tiếng Việt',
        'id': 'Bahasa Indonesia',
        'ms': 'Bahasa Melayu',
        'uk': 'Українська',
        'ro': 'Română',
        'hu': 'Magyar',
        'bg': 'Български',
        'hr': 'Hrvatski',
        'sk': 'Slovenčina',
        'sl': 'Slovenščina',
        'et': 'Eesti',
        'lv': 'Latviešu',
        'lt': 'Lietuvių',
    }
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def translate_text(self, text: str, target_lang: str, source_lang: str = 'auto') -> Dict:
        """
        Translate text using multiple APIs with Turkish-specific optimizations
        Falls back through multiple providers for best quality
        """
        if not text or not text.strip():
            return {'success': True, 'translated': '', 'source_lang': source_lang}
        
        # Preprocess text for better translation (especially for Turkish)
        processed_text = self._preprocess_text_for_translation(text, target_lang)
        
        # Turkish-specific translation strategy
        if target_lang == 'tr' or source_lang == 'tr':
            return self._translate_turkish_optimized(processed_text, target_lang, source_lang)
        
        # Try MyMemory first (1000 words/day free)
        result = self._translate_mymemory(processed_text, target_lang, source_lang)
        if result['success'] and self._is_translation_quality_good(result['translated'], processed_text):
            return self._postprocess_translation(result, text)
        
        # Fallback to LibreTranslate
        result = self._translate_libretranslate(processed_text, target_lang, source_lang)
        if result['success'] and self._is_translation_quality_good(result['translated'], processed_text):
            return self._postprocess_translation(result, text)
        
        # Try Google Translate alternative (Lingva)
        result = self._translate_lingva(processed_text, target_lang, source_lang)
        if result['success'] and self._is_translation_quality_good(result['translated'], processed_text):
            return self._postprocess_translation(result, text)
        
        # If all fail, return error
        return {
            'success': False,
            'error': 'Translation failed. Please try again later.',
            'translated': text
        }
    
    def _translate_mymemory(self, text: str, target_lang: str, source_lang: str) -> Dict:
        """Translate using MyMemory API with enhanced Turkish support"""
        try:
            # MyMemory uses language pairs like "en|tr"
            langpair = f"{source_lang}|{target_lang}"
            
            url = "https://api.mymemory.translated.net/get"
            params = {
                'q': text,
                'langpair': langpair,
                'de': 'submaker@app.com'  # Email for better rate limits
            }
            
            response = self.session.get(url, params=params, timeout=15)
            data = response.json()
            
            if response.status_code == 200 and data.get('responseStatus') == 200:
                response_data = data.get('responseData', {})
                translated = response_data.get('translatedText', '')
                
                # Enhanced post-processing for Turkish
                if translated:
                    # MyMemory sometimes returns uppercase text, fix it
                    if translated.isupper() and not text.isupper():
                        translated = translated.capitalize()
                    
                    # Check translation quality
                    quality_match = response_data.get('match', 0)
                    
                    # For Turkish, be more selective about quality
                    if target_lang == 'tr' or source_lang == 'tr':
                        if quality_match < 0.75 and 'MYMEMORY WARNING' in translated.upper():
                            return {'success': False, 'error': 'Low quality Turkish translation'}
                    
                    # Clean up common MyMemory artifacts
                    translated = translated.replace('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY', '')
                    translated = translated.strip()
                    
                    if translated and translated != text:
                        return {
                            'success': True,
                            'translated': translated,
                            'source_lang': source_lang,
                            'provider': 'mymemory',
                            'quality_score': quality_match
                        }
            
            return {'success': False, 'error': data.get('responseDetails', 'Unknown error')}
                
        except Exception as e:
            print(f"[Translation] MyMemory error: {e}")
            return {'success': False, 'error': str(e)}
    
    def _translate_turkish_optimized(self, text: str, target_lang: str, source_lang: str) -> Dict:
        """Optimized translation strategy specifically for Turkish"""
        print(f"[Translation] Using Turkish-optimized strategy: {source_lang} -> {target_lang}")
        
        # Split long texts into sentences for better quality
        sentences = self._split_into_sentences(text)
        
        if len(sentences) > 1:
            # Translate sentence by sentence for better context
            translated_sentences = []
            for sentence in sentences:
                if not sentence.strip():
                    translated_sentences.append(sentence)
                    continue
                
                # Try multiple providers for each sentence
                result = self._translate_with_multiple_providers(sentence.strip(), target_lang, source_lang)
                if result['success']:
                    translated_sentences.append(result['translated'])
                else:
                    translated_sentences.append(sentence)  # Fallback to original
            
            return {
                'success': True,
                'translated': ' '.join(translated_sentences),
                'source_lang': source_lang,
                'provider': 'turkish_optimized'
            }
        else:
            # Single sentence - try multiple providers
            return self._translate_with_multiple_providers(text, target_lang, source_lang)
    
    def _translate_with_multiple_providers(self, text: str, target_lang: str, source_lang: str) -> Dict:
        """Try multiple translation providers in order of quality for Turkish"""
        
        # Order providers by quality for Turkish
        providers = [
            ('lingva', self._translate_lingva),
            ('mymemory', self._translate_mymemory),
            ('libretranslate', self._translate_libretranslate)
        ]
        
        for provider_name, provider_func in providers:
            try:
                result = provider_func(text, target_lang, source_lang)
                if result['success']:
                    # Check translation quality
                    if self._is_turkish_translation_quality_good(result['translated'], text, target_lang):
                        print(f"[Translation] Success with {provider_name} for Turkish")
                        return result
                    else:
                        print(f"[Translation] {provider_name} quality check failed, trying next...")
            except Exception as e:
                print(f"[Translation] {provider_name} failed: {e}")
                continue
        
        return {
            'success': False,
            'error': 'All Turkish translation providers failed',
            'translated': text
        }
    
    def _translate_lingva(self, text: str, target_lang: str, source_lang: str) -> Dict:
        """Translate using Lingva (Google Translate alternative)"""
        try:
            # Lingva Translate instances
            urls = [
                "https://lingva.ml/api/v1/{}/{}/{}",
                "https://translate.plausibility.cloud/api/v1/{}/{}/{}",
            ]
            
            source_code = source_lang if source_lang != 'auto' else 'auto'
            
            for url_template in urls:
                try:
                    url = url_template.format(source_code, target_lang, urllib.parse.quote(text))
                    response = self.session.get(url, timeout=15)
                    
                    if response.status_code == 200:
                        data = response.json()
                        translated = data.get('translation', '')
                        
                        if translated and translated != text:
                            return {
                                'success': True,
                                'translated': translated,
                                'source_lang': source_lang,
                                'provider': 'lingva'
                            }
                except Exception as e:
                    print(f"[Translation] Lingva instance error: {e}")
                    continue
            
            return {'success': False, 'error': 'Lingva unavailable'}
            
        except Exception as e:
            print(f"[Translation] Lingva error: {e}")
            return {'success': False, 'error': str(e)}
    
    def _preprocess_text_for_translation(self, text: str, target_lang: str) -> str:
        """Preprocess text to improve translation quality"""
        # Basic text cleaning
        processed = text.strip()
        
        # Turkish-specific preprocessing
        if target_lang == 'tr':
            # Fix common English contractions that translate poorly
            replacements = {
                "don't": "do not",
                "won't": "will not",
                "can't": "cannot",
                "I'm": "I am",
                "you're": "you are",
                "it's": "it is",
                "we're": "we are",
                "they're": "they are"
            }
            
            for eng, expanded in replacements.items():
                processed = processed.replace(eng, expanded)
        
        return processed
    
    def _postprocess_translation(self, result: Dict, original_text: str) -> Dict:
        """Post-process translation result for better quality"""
        translated = result.get('translated', '')
        
        # Turkish-specific post-processing
        if 'tr' in [result.get('target_lang'), result.get('source_lang')]:
            # Fix common capitalization issues in Turkish
            if original_text and original_text[0].isupper():
                translated = translated[0].upper() + translated[1:] if len(translated) > 1 else translated.upper()
            
            # Remove extra spaces
            translated = ' '.join(translated.split())
        
        result['translated'] = translated
        return result
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences for better translation"""
        import re
        # Simple sentence splitting for better context
        sentences = re.split(r'[.!?]+\s+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def _is_translation_quality_good(self, translated: str, original: str) -> bool:
        """Basic quality check for translations"""
        if not translated or not translated.strip():
            return False
        
        # Check if translation is just the same as original (likely failed)
        if translated.strip().lower() == original.strip().lower():
            return False
        
        # Check if translation is reasonable length (not too short/long)
        length_ratio = len(translated) / len(original) if len(original) > 0 else 0
        if length_ratio < 0.2 or length_ratio > 5:
            return False
        
        return True
    
    def _is_turkish_translation_quality_good(self, translated: str, original: str, target_lang: str) -> bool:
        """Enhanced quality check specifically for Turkish translations"""
        if not self._is_translation_quality_good(translated, original):
            return False
        
        # Turkish-specific quality checks
        if target_lang == 'tr':
            # Check for common bad translations
            bad_indicators = [
                'MYMEMORY WARNING',
                'TRANSLATED BY HUMANS',
                'Usage over quota',
                'Rate limit exceeded'
            ]
            
            for indicator in bad_indicators:
                if indicator.lower() in translated.lower():
                    return False
            
            # Turkish should have proper word structures
            if len(translated) > 10:  # Only for longer texts
                # Check if it contains reasonable Turkish characters/patterns
                turkish_chars = 'çğıöşüÇĞIİÖŞÜ'
                if any(char in translated for char in turkish_chars):
                    return True  # Contains Turkish chars, likely good
                
                # If no Turkish chars, check if it's reasonable Latin text
                if translated.isascii() and not any(c.isdigit() for c in translated):
                    return True  # Reasonable Latin text
        
        return True
    
    def _translate_libretranslate(self, text: str, target_lang: str, source_lang: str) -> Dict:
        """Translate using LibreTranslate (multiple public instances for better reliability)"""
        try:
            # Multiple LibreTranslate instances for better reliability
            urls = [
                "https://libretranslate.com/translate",
                "https://translate.argosopentech.com/translate",
                "https://translate.fortytwo-it.com/translate",
                "https://libretranslate.de/translate",
            ]
            
            for url in urls:
                try:
                    payload = {
                        'q': text,
                        'source': source_lang if source_lang != 'auto' else 'auto',
                        'target': target_lang,
                        'format': 'text'
                    }
                    
                    response = self.session.post(url, json=payload, timeout=15)
                    
                    if response.status_code == 200:
                        data = response.json()
                        translated = data.get('translatedText', '')
                        
                        if translated and translated != text:
                            return {
                                'success': True,
                                'translated': translated,
                                'source_lang': source_lang,
                                'provider': 'libretranslate'
                            }
                except Exception as e:
                    print(f"[Translation] LibreTranslate instance {url} error: {e}")
                    continue
            
            return {'success': False, 'error': 'All LibreTranslate instances unavailable'}
            
        except Exception as e:
            print(f"[Translation] LibreTranslate error: {e}")
            return {'success': False, 'error': str(e)}
    
    def translate_batch(self, texts: List[str], target_lang: str, source_lang: str = 'auto') -> List[Dict]:
        """
        Translate multiple texts
        """
        results = []
        for text in texts:
            result = self.translate_text(text, target_lang, source_lang)
            results.append(result)
        return results
    
    def translate_subtitles(self, subtitles: List[Dict], target_lang: str, source_lang: str = 'auto') -> List[Dict]:
        """
        Translate subtitle entries
        Returns new list with translated text added
        """
        translated_subtitles = []
        
        for sub in subtitles:
            text = sub.get('text', '')
            result = self.translate_text(text, target_lang, source_lang)
            
            translated_sub = {
                **sub,
                'translatedText': result.get('translated', text),
                'translationSuccess': result.get('success', False)
            }
            translated_subtitles.append(translated_sub)
        
        return translated_subtitles
    
    def get_supported_languages(self) -> Dict[str, str]:
        """Return supported languages"""
        return self.SUPPORTED_LANGUAGES.copy()


# Singleton instance
_translation_service = None

def get_translation_service() -> TranslationService:
    """Get or create the translation service singleton"""
    global _translation_service
    if _translation_service is None:
        _translation_service = TranslationService()
    return _translation_service
