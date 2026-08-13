import os
import sys
import json
import shutil
import asyncio
import subprocess
import time
import signal
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import BASE_DIR, DOWNLOADS_DIR
from backend.downloader import DownloadManager
from backend.history import load_history, delete_from_history


app = FastAPI(title="Yoin Local YouTube Downloader")

# Enable CORS for local development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

download_manager = DownloadManager()

class DownloadRequest(BaseModel):
    url: str
    format_id: str
    audio_only: bool
    resolution: Optional[str] = None

@app.get("/api/status")
def get_status():
    ffmpeg_found = shutil.which("ffmpeg") is not None
    ffprobe_found = shutil.which("ffprobe") is not None
    return {
        "ffmpeg_installed": ffmpeg_found,
        "ffprobe_installed": ffprobe_found,
        "downloads_dir": str(DOWNLOADS_DIR),
        "history_count": len(load_history())
    }

@app.get("/api/info")
def get_video_info(url: str = Query(..., description="YouTube URL to inspect")):
    try:
        info = download_manager.fetch_info(url)
        return info
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.post("/api/download")
async def start_download(request: DownloadRequest):
    try:
        loop = asyncio.get_running_loop()
        task_id = download_manager.start_download(
            url=request.url,
            format_id=request.format_id,
            audio_only=request.audio_only,
            resolution=request.resolution or request.format_id,
            loop=loop
        )
        return {"task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/progress/{task_id}")
async def progress_stream(task_id: str):
    task = download_manager.tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download task not found")
        
    async def event_generator():
        # First send the current state
        initial_data = {
            "status": task.status,
            "percentage": task.percentage,
            "speed": task.speed,
            "eta": task.eta,
            "filename": task.filename,
            "error": task.error
        }
        yield f"data: {json.dumps(initial_data)}\n\n"
        
        while True:
            try:
                # Wait for new progress data
                try:
                    data = await asyncio.wait_for(task.queue.get(), timeout=3.0)
                    yield f"data: {json.dumps(data)}\n\n"
                    
                    if data.get("status") in ["completed", "failed"]:
                        break
                except asyncio.TimeoutError:
                    # Send a ping to keep connection alive
                    yield f"data: {json.dumps({'status': 'ping'})}\n\n"
            except asyncio.CancelledError:
                # Client disconnected, but we leave the download running in background
                break
            except Exception as e:
                yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"
                break
                
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/download/cancel/{task_id}")
def cancel_download(task_id: str):
    success = download_manager.cancel_download(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found or not running")
    return {"success": True}

@app.get("/api/history")
def get_history():
    return load_history()

@app.delete("/api/history/{item_id}")
def delete_history_item(item_id: str, delete_file: bool = Query(False, description="Whether to also delete the file on disk")):
    success = delete_from_history(item_id, delete_file)
    if not success:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"success": True}

@app.post("/api/open-folder")
def open_downloads_folder():
    try:
        dir_path = str(DOWNLOADS_DIR)
        if sys.platform == "win32":
            os.startfile(dir_path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", dir_path])
        else:
            subprocess.Popen(["xdg-open", dir_path])
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder: {str(e)}")

last_heartbeat_time = time.time()
server_started_time = time.time()
has_received_heartbeat = False

@app.post("/api/heartbeat")
def heartbeat():
    global last_heartbeat_time, has_received_heartbeat
    last_heartbeat_time = time.time()
    has_received_heartbeat = True
    return {"status": "ok"}

async def monitor_heartbeat():
    global last_heartbeat_time, has_received_heartbeat
    # Only run auto-shutdown if explicitly enabled for local desktop mode
    if os.getenv("ENABLE_AUTO_SHUTDOWN", "false").lower() != "true":
        return

    # Grace period on startup (45 seconds) to allow the browser to start and connect
    await asyncio.sleep(45)
    while True:
        await asyncio.sleep(2)
        # If we have received a heartbeat in the past and haven't heard back for 5 seconds
        if has_received_heartbeat and (time.time() - last_heartbeat_time > 5):
            print("No browser client detected (heartbeat timeout). Shutting down local server...")
            os._exit(0)
            break
        # If we never received a heartbeat and it's been 60 seconds since launch
        elif not has_received_heartbeat and (time.time() - server_started_time > 60):
            print("No browser client connected within 60 seconds. Shutting down local server...")
            os._exit(0)
            break

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(monitor_heartbeat())





# Mount Static Directories
# Mount downloads static files first so we can grab files directly
app.mount("/downloads", StaticFiles(directory=str(DOWNLOADS_DIR)), name="downloads")

# Mount frontend files at the root
frontend_dir = BASE_DIR / "frontend"
os.makedirs(frontend_dir, exist_ok=True)
app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
