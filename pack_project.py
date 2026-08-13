import os
import zipfile
from pathlib import Path

# Resolve base directory
BASE_DIR = Path(__file__).resolve().parent

# Define the setup guide content
SETUP_GUIDE_TEXT = """===================================================
             Yoin - Media Downloader Setup
===================================================

To run Yoin on a new laptop, follow these simple steps:

1. Install Python:
   - Download and install Python from: https://www.python.org/downloads/
   - IMPORTANT: During installation, make sure to check the box that says "Add Python to PATH" or "Add Python.exe to PATH".

2. Make sure FFmpeg is installed:
   - Yoin requires FFmpeg to merge high-quality video and audio files together.
   - If it is already installed on the laptop, Yoin will detect it automatically.
   - If not, download it from https://ffmpeg.org/ or copy your existing FFmpeg binaries to the new laptop and add them to the Windows PATH.

3. Extract the ZIP folder:
   - Move this 'Yoin' folder to anywhere you like on your new laptop (e.g. D:\\Projects\\Yoin or C:\\Yoin).

4. Generate the Desktop Taskbar Shortcut:
   - Double-click the 'create_desktop_shortcut.py' file.
   - This will instantly generate the custom Yoin logo shortcut on your new Desktop.
   - Right-click the desktop icon and select "Pin to taskbar".

5. Run Yoin:
   - Click the taskbar icon or double-click 'run.bat'.
   - The first run will automatically install uvicorn, fastapi, and yt-dlp dependencies.

Enjoy using Yoin on your new laptop!
"""

def zip_project():
    zip_filename = os.path.join(str(BASE_DIR), "Yoin.zip")
    
    # Write setup guide
    guide_path = os.path.join(str(BASE_DIR), "setup_guide.txt")
    with open(guide_path, "w", encoding="utf-8") as f:
        f.write(SETUP_GUIDE_TEXT)
        
    print("Packaging Yoin into Yoin.zip...")
    
    # Exclude list
    exclude_dirs = {".git", "__pycache__", "downloads", ".venv", ".gemini", "brain"}
    exclude_files = {"Yoin.zip", "downloads_history.json", "setup_guide.txt"}
    
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add setup guide first at root of ZIP
        zipf.write(guide_path, "setup_guide.txt")
        
        # Traverse directory
        for root, dirs, files in os.walk(BASE_DIR):
            # Modify dirs in-place to skip excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                if file in exclude_files:
                    continue
                if file.endswith('.pyc') or file.endswith('.pyo'):
                    continue
                    
                file_path = os.path.join(root, file)
                # Get path relative to the base directory
                rel_path = os.path.relpath(file_path, BASE_DIR)
                zipf.write(file_path, rel_path)
                
        # Create an empty 'downloads' directory structure in the zip
        empty_dir_entry = zipfile.ZipInfo("downloads/")
        zipf.writestr(empty_dir_entry, '')
        
    # Clean up setup guide from root folder after zipping
    if os.path.exists(guide_path):
        os.remove(guide_path)
        
    print(f"Success! Project packaged into: {zip_filename}")

if __name__ == '__main__':
    zip_project()
