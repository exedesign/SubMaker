"""Test transcription service"""
import sys
sys.path.insert(0, 'd:/AI/SubMaker/backend')

from services.transcription import TranscriptionService

svc = TranscriptionService()
svc.load_model()

# Test with transcribe_to_subtitles which is what the API uses
result = svc.transcribe_to_subtitles(
    'd:/AI/SubMaker/temp/e3cca7a96fc04b95a2cd10adc8474205_Bars_Manco_-_Arkadasm_Essek_Mp3..._x_Distorted_lo-fi_vocal_loop_Mashup.mp3',
    language='tr'
)

print(f"\nSubtitles found: {len(result['subtitles'])}")
print(f"Language: {result['language']}")
print(f"Duration: {result['duration']:.2f}s")

print("\nSubtitles:")
for s in result['subtitles'][:15]:
    text = s['text'][:50] if len(s['text']) > 50 else s['text']
    print(f"  {s['id']}. [{s['start']:.2f}s - {s['end']:.2f}s]: {text}")
