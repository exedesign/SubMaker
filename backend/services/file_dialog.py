"""
Native file dialog via PowerShell subprocess.
Works from any thread — no tkinter threading issues.
Writes selected path to a UTF-8 temp file to avoid encoding issues
with non-ASCII characters (Turkish ç, ş, İ etc.) in stdout.
"""
import subprocess
import os
import tempfile
import threading
import sys

_dialog_lock = threading.Lock()

FILE_FILTERS = {
    "audio": {
        "description": "Audio Files",
        "extensions": "*.mp3;*.wav;*.m4a;*.ogg;*.flac;*.aac",
    },
    "video": {
        "description": "Video Files",
        "extensions": "*.mp4;*.mkv;*.avi;*.mov;*.webm",
    },
    "media": {
        "description": "Media Files",
        "extensions": "*.mp3;*.wav;*.m4a;*.ogg;*.flac;*.aac;*.mp4;*.mkv;*.avi;*.mov;*.webm",
    },
    "image": {
        "description": "Image Files",
        "extensions": "*.jpg;*.jpeg;*.png;*.bmp;*.webp",
    },
}


def open_file_dialog(file_type="media", title="Select a file", initial_dir=None):
    """
    Open a native Windows file dialog via PowerShell and return the selected path.

    Returns:
        str: Absolute file path, or None if cancelled / error / already open.
    """
    if sys.platform != "win32":
        print("[file_dialog] Not on Windows, skipping native dialog")
        return None

    if not _dialog_lock.acquire(blocking=False):
        print("[file_dialog] Another dialog is already open")
        return None

    # Create a temp file for the result — avoids stdout encoding corruption
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".txt", prefix="dialog_result_")
    os.close(tmp_fd)

    try:
        preset = FILE_FILTERS.get(file_type)
        if preset:
            filter_str = f'{preset["description"]}|{preset["extensions"]}|All Files|*.*'
        else:
            filter_str = "All Files|*.*"

        initial_dir_line = ""
        if initial_dir and os.path.isdir(initial_dir):
            escaped = initial_dir.replace("'", "''")
            initial_dir_line = f"$dialog.InitialDirectory = '{escaped}'"

        escaped_title = title.replace("'", "''")
        escaped_filter = filter_str.replace("'", "''")
        escaped_tmp = tmp_path.replace("'", "''")

        ps_script = f"""
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '{escaped_title}'
$dialog.Filter = '{escaped_filter}'
$dialog.Multiselect = $false
{initial_dir_line}
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$result = $dialog.ShowDialog($form)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {{
    [System.IO.File]::WriteAllText('{escaped_tmp}', $dialog.FileName, [System.Text.Encoding]::UTF8)
}} else {{
    [System.IO.File]::WriteAllText('{escaped_tmp}', '', [System.Text.Encoding]::UTF8)
}}
"""
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True,
            timeout=120,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )

        # Read the result from the temp file (UTF-8, no encoding issues)
        path = ""
        if os.path.exists(tmp_path):
            with open(tmp_path, "r", encoding="utf-8-sig") as f:
                path = f.read().strip()

        if path and os.path.exists(path):
            print(f"[file_dialog] Selected: {path}")
            return path

        # Debug: log what we got
        if path:
            print(f"[file_dialog] Path from dialog: '{path}' — exists={os.path.exists(path)}")
        else:
            print("[file_dialog] Cancelled (no path selected)")

        return None

    except subprocess.TimeoutExpired:
        print("[file_dialog] Dialog timed out")
        return None
    except Exception as e:
        print(f"[file_dialog] Error: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        # Clean up temp file
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        _dialog_lock.release()
