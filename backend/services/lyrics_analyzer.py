"""
Lyrics Analyzer Service — Uses Qwen 2.5-3B-AWQ to extract structured tags from song lyrics.
Produces color, subject, environment, action, and style tags for cover art prompt generation.
Shares the Qwen model instance with qwen_translation.py via QwenTranslationService.
"""

import json
import logging
import re
from typing import List, Dict, Optional

import torch

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "Analyze song lyrics and return a JSON for album cover art.\n"
    'Return ONLY valid JSON: {"tags":[{"type":"color","value":"...","alternatives":["a","b","c"]},'
    '{"type":"subject","value":"...","alternatives":["a","b","c"]},'
    '{"type":"environment","value":"...","alternatives":["a","b","c"]},'
    '{"type":"action","value":"...","alternatives":["a","b","c"]},'
    '{"type":"style","value":"...","alternatives":["a","b","c"]}],'
    '"raw_prompt":"detailed album cover prompt in English"}\n'
    "Rules: 5 tag types exactly once. Iconic visual metaphors, not literal. "
    "raw_prompt=square composition, high detail. JSON only, no extra text."
)


class LyricsAnalyzerService:
    """Analyzes song lyrics using Qwen 2.5 to extract structured visual tags.
    Shares the Qwen model with QwenTranslationService — no separate VRAM registration."""

    def __init__(self):
        from services.qwen_translation import get_qwen_service
        self._qwen = get_qwen_service()

    def _generate(self, system_prompt: str, user_content: str, max_tokens: int = 256) -> str:
        """Run a single Qwen generation using the shared model."""
        model, tokenizer = self._qwen.get_model_and_tokenizer()

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                do_sample=False,
                repetition_penalty=1.05,
            )

        generated = outputs[0][inputs["input_ids"].shape[1]:]
        return tokenizer.decode(generated, skip_special_tokens=True).strip()

    def analyze_lyrics(self, lyrics: str, system_prompt: Optional[str] = None) -> Dict:
        """
        Analyze lyrics and return structured tags + raw prompt.
        
        Args:
            lyrics: Song lyrics text
            system_prompt: Optional custom system prompt (user-editable from settings)
        
        Returns:
            {"tags": [...], "raw_prompt": "..."}
        """
        try:
            prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
            # Limit lyrics length to reduce input tokens
            truncated = lyrics[:1500] if len(lyrics) > 1500 else lyrics
            raw = self._generate(prompt, truncated)

            # Extract JSON from response (handle markdown code blocks)
            json_match = re.search(r'```(?:json)?\s*(.*?)```', raw, re.DOTALL)
            if json_match:
                raw = json_match.group(1).strip()

            result = json.loads(raw)

            # Validate structure
            if "tags" not in result or "raw_prompt" not in result:
                raise ValueError("Missing required fields")

            valid_types = {"color", "subject", "environment", "action", "style"}
            validated_tags = []
            for tag in result["tags"]:
                if tag.get("type") in valid_types:
                    validated_tags.append({
                        "type": tag["type"],
                        "value": str(tag.get("value", "")),
                        "alternatives": [str(a) for a in tag.get("alternatives", [])[:3]],
                    })

            # Ensure all 5 types present
            existing_types = {t["type"] for t in validated_tags}
            for t in valid_types - existing_types:
                validated_tags.append({"type": t, "value": "", "alternatives": []})

            self._qwen._schedule_unload()
            return {"tags": validated_tags, "raw_prompt": str(result.get("raw_prompt", ""))}

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"[LyricsAnalyzer] Parse error: {e}, raw: {raw[:200] if 'raw' in dir() else 'N/A'}")
            self._qwen._schedule_unload()
            return {
                "tags": [{"type": t, "value": "", "alternatives": []} for t in
                         ["color", "subject", "environment", "action", "style"]],
                "raw_prompt": ""
            }
        except Exception as e:
            logger.error(f"[LyricsAnalyzer] Error: {e}")
            self._qwen._schedule_unload()
            raise

    def get_alternatives(self, tag_type: str, tag_value: str, context: str) -> List[str]:
        """Get 3 alternative suggestions for a specific tag."""
        try:
            prompt = (
                f"Given the song context below, suggest exactly 3 creative alternatives "
                f"for the {tag_type} element '{tag_value}' in an album cover art.\n"
                f"Song context: {context[:500]}\n\n"
                f"Return ONLY a JSON array of 3 strings, nothing else. Example: [\"alt1\", \"alt2\", \"alt3\"]"
            )
            raw = self._generate(
                "You are a creative visual art director. Output only valid JSON arrays.",
                prompt,
                max_tokens=128
            )

            json_match = re.search(r'\[.*?\]', raw, re.DOTALL)
            if json_match:
                alts = json.loads(json_match.group(0))
                return [str(a) for a in alts[:3]]
            return []
        except Exception as e:
            logger.warning(f"[LyricsAnalyzer] Alternatives error: {e}")
            return []
        finally:
            self._qwen._schedule_unload()


# Singleton
_analyzer_service: Optional[LyricsAnalyzerService] = None

def get_lyrics_analyzer() -> LyricsAnalyzerService:
    global _analyzer_service
    if _analyzer_service is None:
        _analyzer_service = LyricsAnalyzerService()
    return _analyzer_service
