import json
import os
import uuid
from datetime import datetime
from typing import List, Dict, Any
from backend.config import HISTORY_FILE, DOWNLOADS_DIR

def load_history() -> List[Dict[str, Any]]:
    """Loads history from JSON, marking whether each file still exists locally."""
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            history = json.load(f)
    except Exception:
        return []
    
    # Verify file existence dynamically
    for item in history:
        filepath = item.get("filepath", "")
        if filepath and os.path.exists(filepath):
            item["file_exists"] = True
        else:
            filename = item.get("filename", "")
            alt_path = DOWNLOADS_DIR / filename if filename else None
            item["file_exists"] = (alt_path.exists() and alt_path.is_file()) if alt_path else False
        
    return history

def save_history(history: List[Dict[str, Any]]):
    """Saves the history list to the JSON file."""
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving history: {e}")

def add_to_history(
    title: str,
    url: str,
    duration: int,
    filesize: int,
    filename: str,
    filepath: str,
    thumbnail: str,
    audio_only: bool
) -> Dict[str, Any]:
    """Adds a new completed download record to the history file."""
    history = load_history()
    
    # Remove file_exists since we check it dynamically on load
    for h in history:
        h.pop("file_exists", None)
        
    new_item = {
        "id": str(uuid.uuid4()),
        "title": title,
        "url": url,
        "duration": duration,  # in seconds
        "filesize": filesize,  # in bytes
        "filename": filename,
        "filepath": filepath,
        "thumbnail": thumbnail,
        "audio_only": audio_only,
        "download_date": datetime.now().isoformat()
    }
    
    # Prepend new item so history shows newest first
    history.insert(0, new_item)
    save_history(history)
    
    new_item["file_exists"] = True
    return new_item

def delete_from_history(item_id: str, delete_file: bool = False) -> bool:
    """Deletes an item from history, and optionally deletes the file on disk."""
    history = load_history()
    item_to_remove = None
    
    for item in history:
        if item.get("id") == item_id:
            item_to_remove = item
            break
            
    if not item_to_remove:
        return False
        
    # Remove from list
    history = [item for item in history if item.get("id") != item_id]
    
    # Remove file_exists key from other items before saving
    for h in history:
        h.pop("file_exists", None)
        
    save_history(history)
    
    # Delete file if requested
    if delete_file:
        filepath = item_to_remove.get("filepath", "")
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as e:
                print(f"Error deleting file {filepath}: {e}")
                
    return True
