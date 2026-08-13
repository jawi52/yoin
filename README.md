# Yoin - Local Media Downloader

Yoin is a personal, self-hosted local web application for downloading YouTube videos, Shorts, and playlists. It interfaces directly with the `yt-dlp` library to fetch and download media streams and uses `ffmpeg` to merge high-resolution video and audio tracks or convert files to MP3 format.

Everything runs on your local machine (`localhost`), and downloaded media is stored directly in a local `downloads/` folder.

---

## Features

- **Format Selection**: Fetches available resolutions (up to 4K/8K), formats, and approximate file sizes before downloading.
- **SSE Streamed Progress**: Displays real-time download percentages, transfer speed, and ETA on the frontend.
- **Audio Extraction**: Support for extracting and converting media streams directly into high-quality MP3 or M4A formats.
- **Playlist Downloader**: Download all videos in a playlist in bulk.
- **Local History**: View past downloads with details and direct play links, backed by a local JSON file.
- **Local Explorer Hook**: Click "Reveal in folder" in the UI to open your default system file explorer pointing to your downloads.
- **Diagnostics**: Checks for `ffmpeg` and `ffprobe` availability on your system.

---

## Installation & Setup

### Prerequisites

#### 1. Python 3.8+
Make sure you have Python installed. You can verify this by running:
```bash
python --version
```

#### 2. Install FFmpeg (Required for Merging and MP3 Conversion)
YT-DLP requires `ffmpeg` and `ffprobe` to merge high-quality video and audio files or extract audio.

- **On Windows (Recommended)**:
  Open PowerShell as Administrator and run:
  ```powershell
  winget install Gyan.FFmpeg
  ```
  *Note: Restart your terminal/shell after the winget installation so the new PATH environment variables take effect.*

- **On macOS**:
  ```bash
  brew install ffmpeg
  ```

- **On Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt update && sudo apt install ffmpeg -y
  ```

---

### App Setup

1. **Clone or copy this folder** to your preferred local directory.
2. **Install the Python requirements**:
   Open a terminal in the project directory and run:
   ```bash
   pip install -r requirements.txt
   ```

---

## Running the App

### Option A: Double-Click (Windows)
Double-click the `run.bat` file in the root folder. This script will automatically verify dependencies, install missing python packages, and start the local FastAPI server.

### Option B: Terminal Command
Run the following command in the project directory:
```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Once running, open your web browser and navigate to:
**[http://localhost:8000](http://localhost:8000)**

---

## Project Structure

```
Yoin/
├── backend/
│   ├── main.py          # FastAPI application server & routes
│   ├── downloader.py    # yt-dlp wrapper and task thread manager
│   ├── history.py       # Flat JSON history CRUD manager
│   └── config.py        # Environment directory setups
├── frontend/
│   ├── index.html       # Single Page Application HTML structure
│   ├── styles.css       # Custom animations and classes
│   └── app.js           # Live SSE connection and rendering logic
├── downloads/           # Saved media files (created automatically)
├── downloads_history.json  # History logs database (created automatically)
├── requirements.txt     # Python requirements
└── run.bat              # Quick start batch file (Windows)
```
