import asyncio
import os
import uuid
import threading
from typing import Dict, Any, List, Optional
import yt_dlp
from backend.config import BASE_DIR, DOWNLOADS_DIR
from backend.history import add_to_history

class DownloadTask:
    def __init__(self, task_id: str, url: str, audio_only: bool, resolution: Optional[str], loop: asyncio.AbstractEventLoop):
        self.task_id = task_id
        self.url = url
        self.audio_only = audio_only
        self.resolution = resolution
        
        self.status = "queued"  # queued, downloading, merging, completed, failed
        self.percentage = 0.0
        self.speed = "0 B/s"
        self.eta = "00:00"
        self.filename = ""
        self.error = None
        
        self.loop = loop
        self.queue = asyncio.Queue()
        self.stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

class DownloadManager:
    def __init__(self):
        self.tasks: Dict[str, DownloadTask] = {}

    def _get_common_ydl_opts(self) -> Dict[str, Any]:
        """Provides robust options for YouTube downloads across local and cloud environments."""
        opts = {
            'remote_components': ['ejs:github'],
            'extractor_args': {
                'youtube': {
                    'player_client': ['web', 'mweb', 'android'],
                    'player_skip': ['configs'],
                }
            },
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            'nocheckcertificate': True,
            'geo_bypass': True,
            'socket_timeout': 30,
            'retries': 10,
            'fragment_retries': 10,
            'quiet': False,
        }

        # Check for cookies file or environment variable
        cookie_file = os.path.join(str(BASE_DIR), 'cookies.txt')
        cookies_env = os.getenv('YOUTUBE_COOKIES')
        if cookies_env and not os.path.exists(cookie_file):
            try:
                with open(cookie_file, 'w', encoding='utf-8') as f:
                    f.write(cookies_env)
            except Exception:
                pass

        if os.path.exists(cookie_file):
            opts['cookiefile'] = cookie_file

        return opts

    def fetch_info(self, url: str) -> Dict[str, Any]:
        """Extracts info from the URL without downloading."""
        ydl_opts = self._get_common_ydl_opts()
        ydl_opts.update({
            'extract_flat': 'in_playlist',  # Faster playlist loading
            'skip_download': True,
        })
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                raise ValueError(f"Failed to fetch video information: {str(e)}")

        if not info:
            raise ValueError("No video information found.")

        is_playlist = info.get('_type') == 'playlist'
        
        result = {
            "title": info.get("title", "Unknown Title"),
            "thumbnail": info.get("thumbnail") or (info.get("entries")[0].get("thumbnail") if is_playlist and info.get("entries") else None),
            "uploader": info.get("uploader", "Unknown Uploader"),
            "duration": info.get("duration", 0),
            "url": url,
            "is_playlist": is_playlist,
            "entries_count": len(info.get("entries", [])) if is_playlist else None,
            "formats": []
        }

        # Parse formats
        if not is_playlist:
            formats_list = info.get("formats", [])
            
            # Find best audio size to estimate merged sizes
            best_audio_size = 0
            for f in formats_list:
                if f.get("vcodec") == "none" and f.get("acodec") != "none":
                    best_audio_size = max(best_audio_size, f.get("filesize") or f.get("filesize_approx") or 0)
            
            # If no audio format found, fallback to 10MB approx
            if best_audio_size == 0:
                best_audio_size = 10 * 1024 * 1024

            # Group video formats by effective resolution
            res_seen = set()
            video_formats = []
            
            for f in formats_list:
                height = f.get("height")
                width = f.get("width")
                vcodec = f.get("vcodec")
                
                if height and vcodec != "none" and f.get("ext") != "mhtml":
                    # Normalize horizontal vs vertical video resolutions (e.g. 1080p for 1920x1080 or 1080x1920)
                    eff_res = min(height, width) if (height and width) else height
                    
                    if eff_res > 180 and eff_res not in res_seen:
                        res_seen.add(eff_res)
                        
                        # Estimate size
                        v_size = f.get("filesize") or f.get("filesize_approx") or 0
                        total_size = v_size + best_audio_size if v_size > 0 else 0
                        
                        video_formats.append({
                            "height": eff_res,
                            "raw_height": height,
                            "ext": "mp4",
                            "size": total_size
                        })

            # Sort formats from high resolution to low
            video_formats.sort(key=lambda x: x["height"], reverse=True)
            
            # Standard formats display list
            for vf in video_formats:
                h = vf["height"]
                raw_h = vf["raw_height"]
                size_str = self._format_size(vf["size"]) if vf["size"] > 0 else "Unknown size"
                
                # Assign user-friendly labels
                label = f"{h}p"
                if h >= 4320:
                    label += " 8K Ultra HD"
                elif h >= 2160:
                    label += " 4K Ultra HD"
                elif h >= 1440:
                    label += " 1440p QHD"
                elif h >= 1080:
                    label += " Full HD"
                elif h >= 720:
                    label += " HD"
                
                result["formats"].append({
                    "id": f"height_{raw_h}",
                    "name": label,
                    "ext": vf["ext"],
                    "filesize_str": size_str,
                    "note": f"Video + Audio (Merged)",
                    "audio_only": False,
                    "height": h
                })

            # Add Audio Only options
            # Find best audio size
            best_audio = None
            for f in formats_list:
                if f.get("vcodec") == "none" and f.get("acodec") != "none":
                    size = f.get("filesize") or f.get("filesize_approx") or 0
                    if not best_audio or size > best_audio.get("size", 0):
                        best_audio = {"ext": f.get("ext", "m4a"), "size": size}

            audio_size_str = self._format_size(best_audio["size"]) if best_audio and best_audio["size"] > 0 else "Unknown size"
            result["formats"].append({
                "id": "audio_mp3",
                "name": "Audio Only (MP3)",
                "ext": "mp3",
                "filesize_str": audio_size_str,
                "note": "Best quality MP3 extraction",
                "audio_only": True,
                "height": None
            })
            result["formats"].append({
                "id": "audio_m4a",
                "name": "Audio Only (M4A)",
                "ext": "m4a",
                "filesize_str": audio_size_str,
                "note": "Original AAC audio track",
                "audio_only": True,
                "height": None
            })
        else:
            # For playlists
            result["formats"] = [
                {
                    "id": "playlist_best",
                    "name": "Full Playlist - Best Video",
                    "ext": "mp4",
                    "filesize_str": "Variable",
                    "note": "Downloads all videos in highest quality",
                    "audio_only": False,
                    "height": None
                },
                {
                    "id": "playlist_mp3",
                    "name": "Full Playlist - Audio Only (MP3)",
                    "ext": "mp3",
                    "filesize_str": "Variable",
                    "note": "Converts all playlist items to MP3",
                    "audio_only": True,
                    "height": None
                }
            ]
            
            # Include entries summary
            entries = []
            for entry in info.get("entries", []):
                if entry:
                    entries.append({
                        "title": entry.get("title") or "Unknown Title",
                        "url": entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id')}",
                        "id": entry.get("id")
                    })
            result["entries"] = entries[:50]  # Limit to first 50 for performance preview

        return result

    def start_download(self, url: str, format_id: str, audio_only: bool, resolution: Optional[str], loop: asyncio.AbstractEventLoop) -> str:
        """Starts a download task in a background thread."""
        task_id = str(uuid.uuid4())
        task = DownloadTask(task_id, url, audio_only, resolution, loop)
        self.tasks[task_id] = task
        
        # Start thread
        task._thread = threading.Thread(
            target=self._run_download_thread,
            args=(task,),
            name=f"Download-{task_id}",
            daemon=True
        )
        task._thread.start()
        
        return task_id

    def cancel_download(self, task_id: str) -> bool:
        """Cancels a running download task."""
        task = self.tasks.get(task_id)
        if not task:
            return False
            
        task.stop_event.set()
        task.status = "failed"
        task.error = "Cancelled by user"
        
        # Notify queue
        data = {
            "status": "failed",
            "percentage": task.percentage,
            "speed": "0 B/s",
            "eta": "00:00",
            "filename": task.filename,
            "error": "Cancelled by user"
        }
        task.loop.call_soon_threadsafe(task.queue.put_nowait, data)
        return True

    def _run_download_thread(self, task: DownloadTask):
        loop = task.loop
        
        def progress_hook(d):
            if task.stop_event.is_set():
                # We raise a custom exception to stop yt-dlp
                raise Exception("Download cancelled by user")
                
            if d['status'] == 'downloading':
                total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes') or 0
                
                if total_bytes > 0:
                    pct = round((downloaded / total_bytes) * 100, 1)
                else:
                    pct_str = d.get('_percent_str', '0%').strip().replace('%', '')
                    try:
                        pct = float(pct_str)
                    except ValueError:
                        pct = 0.0
                
                speed = d.get('_speed_str', '0 B/s').strip()
                eta = d.get('_eta_str', '00:00').strip()
                
                filename = os.path.basename(d.get('filename', ''))
                
                task.status = "downloading"
                task.percentage = pct
                task.speed = speed
                task.eta = eta
                task.filename = filename
                
                data = {
                    "status": "downloading",
                    "percentage": pct,
                    "speed": speed,
                    "eta": eta,
                    "filename": filename,
                    "error": None
                }
                loop.call_soon_threadsafe(task.queue.put_nowait, data)
                
            elif d['status'] == 'finished':
                task.status = "merging"
                data = {
                    "status": "merging",
                    "percentage": 100.0,
                    "speed": "0 B/s",
                    "eta": "00:00",
                    "filename": os.path.basename(d.get('filename', '')),
                    "error": None
                }
                loop.call_soon_threadsafe(task.queue.put_nowait, data)

        # Setup yt-dlp options
        ydl_opts = self._get_common_ydl_opts()
        ydl_opts.update({
            'outtmpl': os.path.join(str(DOWNLOADS_DIR), '%(title)s.%(ext)s'),
            'progress_hooks': [progress_hook],
            'restrictfilenames': False,
            'windowsfilenames': True,
        })

        # Format Selection Logic
        if task.audio_only:
            codec = 'mp3' if 'mp3' in (task.resolution or '').lower() or 'mp3' in task.url.lower() else 'm4a'
            # If resolution has a specific choice
            if task.resolution == "audio_m4a":
                codec = 'm4a'
            elif task.resolution == "audio_mp3":
                codec = 'mp3'
                
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': codec,
                    'preferredquality': '192',
                }],
            })
        else:
            # If resolution is specified (e.g. height_1080)
            if task.resolution and task.resolution.startswith("height_"):
                try:
                    h = int(task.resolution.split("_")[1])
                    ydl_opts.update({
                        'format': f'bestvideo[height<={h}]+bestaudio/best[height<={h}]/best',
                        'merge_output_format': 'mp4',
                    })
                except Exception:
                    ydl_opts.update({
                        'format': 'bestvideo+bestaudio/best',
                        'merge_output_format': 'mp4',
                    })
            else:
                ydl_opts.update({
                    'format': 'bestvideo+bestaudio/best',
                    'merge_output_format': 'mp4',
                })

        try:
            # Run the download
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(task.url, download=True)
                
            # If the task was cancelled mid-download
            if task.stop_event.is_set():
                return
                
            # Determine downloaded file details
            filepath = None
            title = "Unknown Title"
            thumbnail = ""
            duration = 0
            
            # Single video vs playlist
            if info:
                is_playlist = info.get('_type') == 'playlist'
                
                if is_playlist:
                    title = info.get("title", "Playlist Download")
                    thumbnail = info.get("entries", [{}])[0].get("thumbnail", "") if info.get("entries") else ""
                    duration = sum(entry.get("duration", 0) for entry in info.get("entries", []) if entry)
                    
                    # For history, we reference the playlist folder or the first downloaded file
                    # We will find the files downloaded in the directory recently
                    filepath = str(DOWNLOADS_DIR)
                    filename = "Playlist Folder"
                    filesize = 0
                else:
                    title = info.get("title", "Unknown Title")
                    thumbnail = info.get("thumbnail", "")
                    duration = info.get("duration", 0)
                    
                    # Try to locate the file path
                    if info.get('requested_downloads'):
                        filepath = info['requested_downloads'][0].get('filepath')
                    
                    if not filepath or not os.path.exists(filepath):
                        # Fallback heuristic
                        expected_filename = ydl.prepare_filename(info)
                        # Replace extension if audio extraction changed it
                        if task.audio_only:
                            base, _ = os.path.splitext(expected_filename)
                            codec = 'mp3' if task.resolution == "audio_mp3" else 'm4a'
                            expected_filename = f"{base}.{codec}"
                        else:
                            # It merges into mp4 or mkv
                            base, _ = os.path.splitext(expected_filename)
                            if os.path.exists(f"{base}.mp4"):
                                expected_filename = f"{base}.mp4"
                            elif os.path.exists(f"{base}.mkv"):
                                expected_filename = f"{base}.mkv"
                        
                        filepath = expected_filename

                    if filepath and os.path.exists(filepath):
                        filename = os.path.basename(filepath)
                        filesize = os.path.getsize(filepath)
                    else:
                        filename = "Unknown File"
                        filesize = 0
                        filepath = str(DOWNLOADS_DIR)
            else:
                raise Exception("Could not retrieve download information.")

            # Record in history
            history_item = add_to_history(
                title=title,
                url=task.url,
                duration=duration,
                filesize=filesize,
                filename=filename,
                filepath=filepath,
                thumbnail=thumbnail,
                audio_only=task.audio_only
            )

            # Complete task
            task.status = "completed"
            task.percentage = 100.0
            task.speed = "0 B/s"
            task.eta = "00:00"
            task.filename = filename
            
            data = {
                "status": "completed",
                "percentage": 100.0,
                "speed": "0 B/s",
                "eta": "00:00",
                "filename": filename,
                "history_item": history_item,
                "error": None
            }
            loop.call_soon_threadsafe(task.queue.put_nowait, data)

        except Exception as e:
            if "cancelled" in str(e).lower() or task.stop_event.is_set():
                task.status = "failed"
                task.error = "Cancelled by user"
            else:
                task.status = "failed"
                task.error = str(e)
                # Check for common ffmpeg issue
                if "ffmpeg" in str(e).lower() or "ffprobe" in str(e).lower():
                    task.error = "ffmpeg/ffprobe not found. Please install ffmpeg to enable merging/audio extraction."
            
            data = {
                "status": "failed",
                "percentage": task.percentage,
                "speed": "0 B/s",
                "eta": "00:00",
                "filename": task.filename,
                "error": task.error
            }
            loop.call_soon_threadsafe(task.queue.put_nowait, data)

    @staticmethod
    def _format_size(bytes_size: int) -> str:
        """Utility to format size in bytes to human-readable string."""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if bytes_size < 1024.0:
                return f"{bytes_size:.1f} {unit}"
            bytes_size /= 1024.0
        return f"{bytes_size:.1f} PB"
