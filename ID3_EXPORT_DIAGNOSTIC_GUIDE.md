# ID3 Export Path Fix - Diagnostic & Testing Guide

## Problem
When exporting subtitles as ID3 tags (SYLT) to MP3 files, the tags were being written to the temp directory (`D:\AI\SubMaker\temp`) instead of the original source file location.

## Changes Made

### 1. Frontend (appStore.js)
- **Fixed `uploadFile()`**: Now also sets `originalMediaFile` when uploading files, not just from native dialogs
- **Added Debug Logging**: Export now logs what paths are being sent to the backend
  - Check browser console (F12) for `[EXPORT DEBUG]` and `[EXPORT REQUEST]` messages

### 2. Backend (routes.py)
- **Enhanced Path Resolution**: 
  - Added `can_access_mp3()` helper function that actually tries to access files
  - Instead of just checking existence, now verifies the file can be read
  - Provides detailed error messages about why paths fail

- **Added Comprehensive Debugging**:
  - Logs exactly what `original_file_path` and `source_file` were received
  - Shows which paths were tried and why they failed
  - Logs whether files exist, are readable, and are valid MP3s

- **Added Directory Search Fallback**:
  - If exact path fails, tries to find the file in the parent directory
  - Useful if file was moved but stays in same folder structure

## How to Test

### Step 1: Load the File
1. Open SubMaker in Electron (the desktop app)
2. Click **"Select Audio"** button (native file dialog)
3. Navigate to your file: `C:\Users\FE\Downloads\Album\Cocuk-ilahi\KRYPTA - Çocuk İlahileri - 01 - Koy Bizi de Cennetine.mp3`
4. Select and load the file

**Important**: Use the **"Select Audio"** or **"Select Video"** buttons (native dialog), NOT drag-and-drop

### Step 2: Export with Debugging
1. Create or import subtitles as normal
2. Open browser dev tools: **F12** or **Ctrl+Shift+I**
3. Go to **Console** tab
4. Click the ID3 export button (or "Göm" button if you have it)
5. **In browser console**, you should see:
   ```
   [EXPORT DEBUG]: { format: 'id3', mediaFile: '...', originalMediaFile: '...', ... }
   [EXPORT REQUEST]: { subtitles: [...], format: 'id3', source_file: '...', original_file_path: '...', ... }
   ```

### Step 3: Check Backend Logs
1. Look at the **backend terminal** where the server is running
2. You should see detailed logs like:
   ```
   [ID3 DEBUG] REQUEST RECEIVED:
     original_file_path: C:\Users\FE\Downloads\Album\...
     source_file: C:\Users\FE\Downloads\Album\...
   [ID3 DEBUG] original_file_path check:
     path=C:\Users\FE\Downloads\Album\...
     can_access=True
     is_mp3=True
   [ID3] ✓ Using original file path: C:\Users\FE\Downloads\Album\...
   [ID3] Writing SYLT to: C:\Users\FE\Downloads\Album\...
   ```

### Step 4: Verify Result
- Check if the SYLT tags were written to **your original file location** (not temp)
- The message should show the correct path, not `D:\AI\SubMaker\temp`

## Expected Behavior After Fix

✅ **Native Dialog Flow**:
- User selects file via "Select Audio" button
- File path is preserved in `originalMediaFile`
- Export writes tags to original file location
- Message shows: `✓ 69 SYLT entry gömüldü → C:\Users\FE\Downloads\Album\...`

✅ **Upload Flow** (drag-drop or file input):
- File is uploaded to temp directory
- Export writes tags to temp location (this is expected)
- Can later be copied to original location if needed

## Troubleshooting

### If Still Writing to Temp
1. Check if you're using **native dialog** (Select Audio button) - not drag-drop
2. Check browser console for `[EXPORT DEBUG]` output
   - If `originalMediaFile` is null/undefined, the native dialog might not be working
   - If it has a value, check if it matches your actual file path
3. Check backend logs for path resolution details
   - Look for `[ID3 DEBUG]` messages showing what paths were tried
   - Note why each path was rejected

### If File Not Found
- Verify the file still exists at the original location
- Check file permissions (must be readable AND writable)
- Check for special characters in path (e.g., Turkish characters: ç, ğ, ı, ö, ş, ü, İ)

### If Permission Denied
- Make sure you have write access to the folder where MP3 is stored
- Try moving the file to a different location with write access (e.g., Documents)
- On Windows, check if file has read-only attribute

## Files Modified
- `electron/src/renderer/stores/appStore.js` - Added logging, fixed uploadFile
- `backend/api/routes.py` - Enhanced path resolution with detailed debugging

## Next Steps
After testing:
1. Report the browser console and backend terminal output
2. Include the paths shown in `[ID3 DEBUG]` logs
3. Let me know if original file path is being used or if it's still falling back to temp
