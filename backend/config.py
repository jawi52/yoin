import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
HISTORY_FILE = BASE_DIR / "downloads_history.json"

# Ensure directories exist
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
