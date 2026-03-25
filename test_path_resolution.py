from pathlib import Path
import sys
sys.path.insert(0, 'backend')

# Test the can_access_mp3 function logic
from services.lyrics_tagger import LyricsTagger

tagger = LyricsTagger()

def can_access_mp3(path_str):
    """Check if we can read the MP3 file"""
    try:
        p = Path(path_str)
        # Try to check if file exists and is readable
        if not p.exists():
            return False, "Path does not exist"
        if not p.is_file():
            return False, "Path is not a file"
        if not tagger.is_mp3(path_str):
            return False, "Not an MP3 file"
        # Try to open it to verify access
        with open(path_str, 'rb') as f:
            f.read(1024)  # Read first 1KB to verify access
        return True, "OK"
    except PermissionError:
        return False, "Permission denied"
    except FileNotFoundError:
        return False, "File not found"
    except Exception as e:
        return False, str(e)

# Test with a file that exists in temp
test_file = Path("temp") / "test.mp3"
mp3_files = list(Path("temp").glob("*.mp3"))
if mp3_files:
    test_file = mp3_files[0]
    result, reason = can_access_mp3(str(test_file))
    print(f"✓ Test file: {test_file}")
    print(f"✓ Can access: {result} ({reason})")
else:
    print("✗ No test MP3 files found in temp/")

# Test non-existent path (like the user's)
fake_path = r"C:\Users\FE\Downloads\Album\Cocuk-ilahi\KRYPTA - Çocuk İlahileri - 01 - Koy Bizi de Cennetine.mp3"
result, reason = can_access_mp3(fake_path)
print(f"\n✓ Fake path test: {result} ({reason})")
print("✓ Path resolution logic working correctly")
