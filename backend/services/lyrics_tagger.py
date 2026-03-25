"""
Lyrics Tagger Service
Writes synchronized lyrics (SYLT) and unsynchronized lyrics (USLT)
into MP3 files as ID3v2.4 tags using mutagen.

Key notes:
- ID3v2.4 with UTF-8 encoding for modern player support
- SYLT timestamps in milliseconds (format=2) for precise sync
- Each SYLT text entry ends with newline (per spec)
"""
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

_lyrics_tagger_instance = None


def get_lyrics_tagger():
    """Get or create singleton LyricsTagger instance"""
    global _lyrics_tagger_instance
    if _lyrics_tagger_instance is None:
        _lyrics_tagger_instance = LyricsTagger()
    return _lyrics_tagger_instance


# ISO 639-2 (3-letter) language code mapping
LANG_CODE_MAP = {
    'en': 'eng', 'ar': 'ara', 'tr': 'tur', 'es': 'spa',
    'fr': 'fra', 'de': 'deu', 'it': 'ita', 'pt': 'por',
    'ru': 'rus', 'zh': 'zho', 'ja': 'jpn', 'ko': 'kor',
    'he': 'heb', 'fa': 'fas', 'ur': 'urd', 'hi': 'hin',
    'nl': 'nld', 'pl': 'pol', 'sv': 'swe', 'da': 'dan',
}


class LyricsTagger:
    """
    Writes synchronized and unsynchronized lyrics into MP3 ID3 tags.

    Supports:
    - SYLT (Synchronized Lyrics): Word-level or line-level timestamps in ms
    - USLT (Unsynchronized Lyrics): Plain text lyrics as fallback
    """

    @staticmethod
    def is_mp3(file_path: str) -> bool:
        return Path(file_path).suffix.lower() == '.mp3'

    @staticmethod
    def is_available() -> bool:
        try:
            import mutagen
            return True
        except ImportError:
            return False

    def _get_lang_code(self, language: str) -> str:
        """Convert 2-letter ISO 639-1 to 3-letter ISO 639-2 code"""
        return LANG_CODE_MAP.get(language, language[:3] if len(language) >= 3 else 'eng')

    def _load_tags(self, mp3_path: str):
        """Load ID3 tags, creating header if missing"""
        from mutagen.id3 import ID3
        from mutagen.id3._util import ID3NoHeaderError

        try:
            tags = ID3(mp3_path, v2_version=4)
            return tags
        except ID3NoHeaderError:
            logger.info(f"No ID3 header, creating: {mp3_path}")
            tags = ID3()
            tags.save(mp3_path, v2_version=4)
            return ID3(mp3_path, v2_version=4)

    def _build_sync_data(self, subtitles: List[Dict[str, Any]]) -> list:
        """Build SYLT sync data from subtitles.

        Returns list of (text, timestamp_ms) tuples.
        Per ID3v2.3 SYLT spec, each text entry should end with newline.
        """
        sync_data = []
        for sub in subtitles:
            if "words" in sub and sub["words"]:
                # Word-level timestamps
                for word in sub["words"]:
                    text = word.get("word", "").strip()
                    if text:
                        ts = int(float(word["start"]) * 1000)
                        sync_data.append((text + "\n", ts))
            else:
                # Line-level timestamps
                text = sub.get("text", "").strip()
                if text:
                    ts = int(float(sub["start"]) * 1000)
                    sync_data.append((text + "\n", ts))
        return sync_data

    def write_synced_lyrics(
        self,
        mp3_path: str,
        subtitles: List[Dict[str, Any]],
        language: str = "en"
    ) -> Dict[str, bool]:
        """
        Write both SYLT and USLT lyrics to MP3 in a single save operation.
        Uses ID3v2.4 with UTF-8 encoding.

        Returns dict with 'sylt' and 'uslt' success status.
        """
        print(f"\n[ID3v2.4] Target file: {mp3_path}")
        print(f"[ID3v2.4] File exists: {Path(mp3_path).exists()}")

        if not self.is_mp3(mp3_path):
            logger.error(f"Not an MP3 file: {mp3_path}")
            return {"sylt": False, "uslt": False}

        if not self.is_available():
            logger.error("mutagen not installed")
            return {"sylt": False, "uslt": False}

        from mutagen.id3 import ID3, SYLT, USLT, Encoding, TOLY

        results = {"sylt": False, "uslt": False, "toly": False}

        try:
            tags = self._load_tags(mp3_path)
            lang_code = self._get_lang_code(language)

            logger.info(f"Writing ID3v2.4 SYLT to: {mp3_path} (lang={lang_code})")

            # --- TOLY (Lyricist) ---
            tags.delall("TOLY")
            tags.add(TOLY(
                encoding=Encoding.UTF8,
                text=["SubMaker"]
            ))
            results["toly"] = True

            # --- SYLT (Synchronized Lyrics) ---
            sync_data = self._build_sync_data(subtitles)
            if sync_data:
                tags.delall("SYLT")

                sylt_frame = SYLT(
                    encoding=Encoding.UTF8,   # UTF-8 for ID3v2.4
                    lang=lang_code,
                    format=2,    # 2 = milliseconds
                    type=1,      # 1 = lyrics
                    desc="",
                    text=sync_data
                )
                tags.add(sylt_frame)
                results["sylt"] = True
                logger.info(f"SYLT: {len(sync_data)} entries (ms precision)")
            else:
                logger.warning("No sync data to write for SYLT")

            # --- USLT (Unsynchronized Lyrics) — LRC-formatted with timestamps ---
            lrc_text = self._build_lrc_lyrics(subtitles)

            if lrc_text:
                tags.delall("USLT")
                tags.add(USLT(
                    encoding=Encoding.UTF8,
                    lang=lang_code,
                    desc="",
                    text=lrc_text
                ))
                results["uslt"] = True
                logger.info(f"USLT: {len(lrc_text)} chars (LRC timestamped)")

            # Save with ID3v2.4
            tags.save(mp3_path, v2_version=4)
            print(f"[ID3v2.4] Saved to: {mp3_path}")

            # Verify
            verify_tags = ID3(mp3_path)
            sylt_check = verify_tags.getall("SYLT")
            uslt_check = verify_tags.getall("USLT")

            if sylt_check:
                sample = sylt_check[0].text[:3]
                print(f"[ID3v2.4] SYLT verified: {len(sylt_check[0].text)} entries, sample: {sample}")
            else:
                logger.error("SYLT verification FAILED")
                results["sylt"] = False

            if uslt_check:
                logger.info(f"USLT verified: {len(uslt_check[0].text)} chars")
            else:
                logger.error("USLT verification FAILED")
                results["uslt"] = False

            return results

        except Exception as e:
            logger.error(f"Failed to write lyrics tags: {e}")
            import traceback
            traceback.print_exc()
            return results

    def _build_lrc_lyrics(self, subtitles: List[Dict[str, Any]]) -> str:
        """Build LRC-formatted lyrics with timestamps from subtitle data.

        Produces Enhanced LRC (word-level) when word data is available,
        falls back to standard LRC (line-level) otherwise.
        """
        lines = []
        for sub in subtitles:
            start = sub.get("start", 0)
            text = sub.get("text", "").strip()
            if not text:
                continue

            line_ts = self._format_lrc_time(start)

            if "words" in sub and sub["words"]:
                # Enhanced LRC with word-level timestamps
                word_parts = []
                for word in sub["words"]:
                    word_text = word.get("word", "").strip()
                    if word_text:
                        word_ts = self._format_lrc_time(word.get("start", start))
                        word_parts.append(f"<{word_ts}>{word_text}")
                if word_parts:
                    lines.append(f"[{line_ts}]{' '.join(word_parts)}")
                else:
                    lines.append(f"[{line_ts}]{text}")
            else:
                # Standard LRC with line-level timestamps
                lines.append(f"[{line_ts}]{text}")

        return "\n".join(lines)

    @staticmethod
    def _format_lrc_time(seconds: float) -> str:
        """Format seconds as LRC timestamp mm:ss.xx"""
        minutes = int(seconds // 60)
        secs = seconds % 60
        return f"{minutes:02d}:{secs:05.2f}"

    def read_sylt(self, mp3_path: str) -> Optional[List[tuple]]:
        """Read existing SYLT tag from MP3 file (for verification)"""
        if not self.is_mp3(mp3_path) or not self.is_available():
            return None

        from mutagen.id3 import ID3

        try:
            tags = ID3(mp3_path)

            # Log all frame types for debugging
            frame_types = [k for k in tags.keys()]
            logger.info(f"ID3 frames in file: {frame_types}")

            sylt_frames = tags.getall("SYLT")
            if sylt_frames:
                logger.info(f"SYLT found: {len(sylt_frames[0].text)} entries")
                return sylt_frames[0].text

            logger.warning("No SYLT frame found in file")
        except Exception as e:
            logger.error(f"Failed to read SYLT tag: {e}")

        return None

    def read_all_lyrics(self, mp3_path: str) -> Dict[str, Any]:
        """Read all lyrics tags from MP3 file (for debugging)"""
        if not self.is_mp3(mp3_path) or not self.is_available():
            return {"error": "not available"}

        from mutagen.id3 import ID3

        try:
            tags = ID3(mp3_path)
            result = {
                "id3_version": f"v2.{tags.version[1]}",
                "all_frames": [k for k in tags.keys()],
                "sylt": None,
                "uslt": None,
            }

            sylt_frames = tags.getall("SYLT")
            if sylt_frames:
                sf = sylt_frames[0]
                result["sylt"] = {
                    "entries": len(sf.text),
                    "lang": sf.lang,
                    "encoding": str(sf.encoding),
                    "sample": [(t.rstrip('\n'), ts) for t, ts in sf.text[:5]],
                }

            uslt_frames = tags.getall("USLT")
            if uslt_frames:
                uf = uslt_frames[0]
                result["uslt"] = {
                    "length": len(uf.text),
                    "lang": uf.lang,
                    "preview": uf.text[:200],
                }

            return result
        except Exception as e:
            return {"error": str(e)}
