"""
Qwen2.5 Local Translation Service for SubMaker
Uses Qwen2.5-3B-Instruct AWQ (4-bit quantized) for GPU-accelerated song lyrics translation
~2 GB VRAM usage — safe alongside Whisper on 8GB GPUs
"""

# Monkey-patch: autoawq imports PytorchGELUTanh which was renamed to GELUTanh in transformers >=4.55
import transformers.activations as _act
if not hasattr(_act, 'PytorchGELUTanh') and hasattr(_act, 'GELUTanh'):
    _act.PytorchGELUTanh = _act.GELUTanh

import torch
import gc
import threading
from pathlib import Path
from typing import List, Dict, Optional
from threading import Lock

from config import MODELS_DIR

# Local bundled model directory
LOCAL_QWEN_DIR = MODELS_DIR / "qwen2.5-3b-awq"

# Language name mapping for the system prompt
LANGUAGE_NAMES = {
    'en': 'English', 'tr': 'Turkish', 'es': 'Spanish', 'fr': 'French',
    'de': 'German', 'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian',
    'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese', 'ar': 'Arabic',
    'hi': 'Hindi', 'nl': 'Dutch', 'pl': 'Polish', 'sv': 'Swedish',
    'da': 'Danish', 'fi': 'Finnish', 'no': 'Norwegian', 'cs': 'Czech',
    'el': 'Greek', 'he': 'Hebrew', 'th': 'Thai', 'vi': 'Vietnamese',
    'id': 'Indonesian', 'ms': 'Malay', 'uk': 'Ukrainian', 'ro': 'Romanian',
    'hu': 'Hungarian', 'bg': 'Bulgarian', 'hr': 'Croatian', 'sk': 'Slovak',
    'sl': 'Slovenian', 'fa': 'Persian', 'ur': 'Urdu', 'ps': 'Pashto',
    'sd': 'Sindhi', 'yi': 'Yiddish', 'ug': 'Uyghur',
}

SYSTEM_PROMPT = (
    "You are a professional song lyrics translator. "
    "Translate the following lyrics faithfully into {target_language}. "
    "Preserve the poetic meaning, rhythm, and emotional tone. "
    "Do not add commentary, explanations, or annotations. "
    "Output only the translated lyrics."
)

MODEL_ID = "Qwen/Qwen2.5-3B-Instruct-AWQ"


class QwenTranslationService:
    """Local translation service using Qwen2.5-3B-Instruct-AWQ"""

    def __init__(self):
        self.model = None
        self.tokenizer = None
        self._lock = Lock()
        self._loaded = False
        self._unload_timer = None

        # Register with VRAM manager
        from services.vram_manager import get_vram_manager
        get_vram_manager().register("qwen", self.unload)

    def ensure_loaded(self):
        """Lazy-load model on first use. Public so other services can share the model."""
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return

            # Evict any other model (e.g. Whisper) before loading Qwen
            from services.vram_manager import get_vram_manager
            get_vram_manager().acquire("qwen")

            # Suppress AWQ deprecation and missing CUDA extension warnings
            import warnings
            warnings.filterwarnings("ignore", message=".*AutoAWQ is officially deprecated.*")
            warnings.filterwarnings("ignore", message=".*naive.*slow.*implementation.*")

            # Use local bundled model if available, otherwise fall back to HuggingFace
            if (LOCAL_QWEN_DIR / "model.safetensors").exists():
                model_path = str(LOCAL_QWEN_DIR)
                print(f"[Qwen] Loading model from local path: {model_path}")
            else:
                model_path = MODEL_ID
                print(f"[Qwen] Local model not found, downloading {MODEL_ID} from HuggingFace...")

            from transformers import AutoModelForCausalLM, AutoTokenizer

            self.tokenizer = AutoTokenizer.from_pretrained(
                model_path,
                trust_remote_code=True,
            )
            self.model = AutoModelForCausalLM.from_pretrained(
                model_path,
                device_map="auto",
                dtype=torch.float16,
            )
            self.model.eval()
            self._loaded = True
            print("[Qwen] Model loaded successfully")

    def get_model_and_tokenizer(self):
        """Ensure model is loaded and return (model, tokenizer) for shared use."""
        self.ensure_loaded()
        return self.model, self.tokenizer

    @property
    def is_loaded(self):
        return self._loaded

    def unload(self):
        """Free GPU memory — call after translation batch is done"""
        with self._lock:
            if not self._loaded:
                return
            if self._unload_timer:
                self._unload_timer.cancel()
                self._unload_timer = None
            print("[Qwen] Unloading model to free VRAM...")
            del self.model
            del self.tokenizer
            self.model = None
            self.tokenizer = None
            self._loaded = False
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("[Qwen] Model unloaded")

    def translate_text(self, text: str, target_lang: str, source_lang: str = 'auto') -> Dict:
        """Translate a single text using Qwen2.5"""
        if not text or not text.strip():
            return {'success': True, 'translated': '', 'source_lang': source_lang}

        try:
            self.ensure_loaded()

            target_language = LANGUAGE_NAMES.get(target_lang, target_lang)
            system_msg = SYSTEM_PROMPT.format(target_language=target_language)

            messages = [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": text},
            ]

            prompt = self.tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )

            inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=256,
                    do_sample=False,
                    repetition_penalty=1.05,
                )

            # Decode only the new tokens (skip the prompt)
            generated = outputs[0][inputs["input_ids"].shape[1]:]
            translated = self.tokenizer.decode(generated, skip_special_tokens=True).strip()

            # Strip common hallucinated meta-text from translation output
            translated = self._clean_translation(translated)

            if not translated:
                return {'success': False, 'error': 'Empty translation', 'translated': text}

            return {
                'success': True,
                'translated': translated,
                'source_lang': source_lang,
                'provider': 'qwen'
            }

        except Exception as e:
            print(f"[Qwen] Translation error: {e}")
            return {'success': False, 'error': str(e), 'translated': text}

    def _schedule_unload(self, delay: float = 120.0):
        """Schedule model unload after a delay — allows concurrent requests to finish"""
        if self._unload_timer:
            self._unload_timer.cancel()
        self._unload_timer = threading.Timer(delay, self.unload)
        self._unload_timer.daemon = True
        self._unload_timer.start()
        print(f"[Qwen] Model will unload in {delay}s if idle")

    @staticmethod
    def _clean_translation(text: str) -> str:
        """Remove hallucinated meta-text that Qwen sometimes adds to translations.
        
        Common patterns: "Altyazı M.K.", "Çeviri: ...", "Subtitle by ...",
        prefixed annotations like "Translation:", numbered lines, etc.
        """
        import re
        if not text:
            return text

        original = text

        # Remove lines that are entirely hallucinated credit/meta patterns
        HALLUCINATION_LINE_PATTERNS = [
            r'^[\s]*altyaz[ıi]\s*[:\-]?\s*m\s*\.?\s*k\s*\.?\s*$',
            r'^[\s]*alt\s*yaz[ıi]\s*[:\-]?\s*m\s*\.?\s*k\s*\.?\s*$',
            r'^[\s]*altyaz[ıi]lar\s*[:\-]?\s*m\s*\.?\s*k\s*\.?\s*$',
            r'^[\s]*[çc]eviri\s*[:\-]?\s*m\s*\.?\s*k\s*\.?\s*$',
            r'^[\s]*subtitle[sd]?\s*(?:by)?\s*m\s*\.?\s*k\s*\.?\s*$',
            r'^[\s]*translated?\s*(?:by|:).*$',
            r'^[\s]*transcribed?\s*(?:by|:).*$',
            r'^[\s]*subtitle[sd]?\s*(?:by|:).*$',
            r'^[\s]*caption[sd]?\s*(?:by|:).*$',
            r'^[\s]*altyaz[ıi]\s*(?:çeviri|tercüme).*$',
        ]

        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            is_hallucination = False
            for pattern in HALLUCINATION_LINE_PATTERNS:
                if re.match(pattern, line, re.IGNORECASE):
                    is_hallucination = True
                    break
            if not is_hallucination:
                cleaned_lines.append(line)

        text = '\n'.join(cleaned_lines).strip()

        # Remove "Translation:" or "Çeviri:" prefix from first line
        text = re.sub(r'^(?:translation|çeviri|tercüme)\s*:\s*', '', text, flags=re.IGNORECASE).strip()

        if not text and original:
            # If cleaning removed everything, return original (don't lose data)
            return original

        return text

    def translate_subtitles(self, subtitles: List[Dict], target_lang: str, source_lang: str = 'auto') -> List[Dict]:
        """Translate subtitle entries, then schedule model unload to free VRAM"""
        translated_subtitles = []

        # Cancel any pending unload since we're actively translating
        if self._unload_timer:
            self._unload_timer.cancel()
            self._unload_timer = None

        for i, sub in enumerate(subtitles):
            text = sub.get('text', '')
            result = self.translate_text(text, target_lang, source_lang)

            translated_sub = {
                **sub,
                'translatedText': result.get('translated', text),
                'translationSuccess': result.get('success', False),
            }
            translated_subtitles.append(translated_sub)

            if (i + 1) % 10 == 0:
                print(f"[Qwen] Translated {i + 1}/{len(subtitles)} subtitles")

        # Schedule unload after idle period
        self._schedule_unload()

        return translated_subtitles

    def get_supported_languages(self) -> Dict[str, str]:
        """Return supported languages"""
        return LANGUAGE_NAMES.copy()


# Singleton
_qwen_service: Optional[QwenTranslationService] = None

def get_qwen_service() -> QwenTranslationService:
    """Get the shared singleton QwenTranslationService instance."""
    global _qwen_service
    if _qwen_service is None:
        _qwen_service = QwenTranslationService()
    return _qwen_service
