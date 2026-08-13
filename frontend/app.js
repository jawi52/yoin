// Global State
let fetchedInfo = null;
const activeDownloads = new Map(); // taskId -> { title, thumbnail, formatName, eventSource }

// Init on Load
document.addEventListener('DOMContentLoaded', () => {
    // Nav links setup
    navigateToTab('home');
    loadHistory();
    checkSystemStatus();

    // Event Listeners
    document.getElementById('fetch-form').addEventListener('submit', handleFetchSubmit);
    document.getElementById('history-search-input').addEventListener('input', handleHistorySearch);
    document.getElementById('open-folder-nav-btn').addEventListener('click', openDownloadsFolder);
    document.getElementById('open-folder-history-btn').addEventListener('click', openDownloadsFolder);
    
    // Settings modal events
    const settingsBtn = document.getElementById('settings-nav-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtns = [document.getElementById('close-settings-btn'), document.getElementById('close-settings-btn-footer')];

    settingsBtn.addEventListener('click', () => {
        checkSystemStatus();
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                settingsModal.classList.add('hidden');
            });
        }
    });

    // Dropzone Click -> Clipboard paste integration
    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
                document.getElementById('video-url-input').value = text.trim();
                showToast("URL pasted from clipboard!", "success");
                // Automatically submit
                document.getElementById('fetch-btn').click();
            } else {
                document.getElementById('video-url-input').focus();
            }
        } catch (err) {
            // Permission denied or not supported, just focus the input
            document.getElementById('video-url-input').focus();
        }
    });

    // Drag & Drop visual feedback
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('bg-primary/5', 'border-primary');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('bg-primary/5', 'border-primary');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const text = e.dataTransfer.getData('text');
        if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
            document.getElementById('video-url-input').value = text.trim();
            document.getElementById('fetch-btn').click();
        }
    });

    // Windows Startup Toggle Event Listener
    // Start heartbeat loop to keep the local server alive
    startHeartbeat();
});

// Heartbeat Loop (keeps backend server alive while browser is open)
function startHeartbeat() {
    // Send heartbeat immediately on load
    fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    
    // Repeat every 2 seconds for a fast 5-second shutdown check
    setInterval(() => {
        fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    }, 2000);
}

// Navigation Router
function navigateToTab(tabId) {
    // Hide all tab views
    document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.remove('active');
    });

    // Show selected tab view
    const selectedView = document.getElementById(`view-${tabId}`);
    if (selectedView) {
        selectedView.classList.add('active');
    }

    // Reset active nav button classes
    const activeClasses = ['bg-secondary-container', 'text-on-secondary-container', 'font-bold'];
    const inactiveClasses = ['text-on-surface-variant', 'hover:text-on-surface', 'hover:bg-surface-container-highest'];

    // Sidebar update
    document.querySelectorAll('aside .nav-button').forEach(btn => {
        if (btn.id === `sidebar-tab-${tabId}`) {
            btn.classList.add(...activeClasses);
            btn.classList.remove(...inactiveClasses);
        } else {
            btn.classList.remove(...activeClasses);
            btn.classList.add(...inactiveClasses);
        }
    });

    // Mobile bar update
    document.querySelectorAll('nav.md\\:hidden .nav-button').forEach(btn => {
        if (btn.id === `mobile-tab-${tabId}`) {
            btn.classList.add('text-primary');
            btn.classList.remove('text-on-surface-variant');
            // Check if filled icon needed
            const icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.style.fontVariationSettings = "'FILL' 1";
        } else {
            btn.classList.remove('text-primary');
            btn.classList.add('text-on-surface-variant');
            const icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.style.fontVariationSettings = "'FILL' 0";
        }
    });

    // Special behavior on load
    if (tabId === 'history') {
        loadHistory();
    }
}

// Check backend status & diagnostics
async function checkSystemStatus() {
    try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        // Update diagnostics text
        updateDiagnosticLabel('diag-ffmpeg', data.ffmpeg_installed);
        updateDiagnosticLabel('diag-ffprobe', data.ffprobe_installed);
        
        // Update folder path
        document.getElementById('settings-download-path').innerText = data.downloads_dir;
    } catch (err) {
        updateDiagnosticLabel('diag-ffmpeg', false, "Disconnected");
        updateDiagnosticLabel('diag-ffprobe', false, "Disconnected");
    }
}

function updateDiagnosticLabel(id, success, customMsg = null) {
    const el = document.getElementById(id);
    if (!el) return;
    if (success) {
        el.innerText = customMsg || "Detected";
        el.className = "text-green-500 font-bold";
    } else {
        el.innerText = customMsg || "Not Found";
        el.className = "text-error font-bold";
    }
}

// Fetch Video Info Submit
async function handleFetchSubmit(e) {
    e.preventDefault();
    const urlInput = document.getElementById('video-url-input');
    const url = urlInput.value.trim();
    if (!url) return;

    const fetchBtn = document.getElementById('fetch-btn');
    const originalBtnHTML = fetchBtn.innerHTML;
    fetchBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">sync</span><span>Fetching...</span>';
    fetchBtn.disabled = true;

    try {
        const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Failed to retrieve video information");
        }

        fetchedInfo = await res.json();
        renderFormatSelection(fetchedInfo);
        
        // Switch sub-view from input to formats list
        document.getElementById('subview-input').classList.remove('active');
        document.getElementById('subview-formats').classList.add('active');
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        fetchBtn.innerHTML = originalBtnHTML;
        fetchBtn.disabled = false;
    }
}

// Back to Input Screen
function backToInput() {
    document.getElementById('subview-formats').classList.remove('active');
    document.getElementById('subview-input').classList.add('active');
    fetchedInfo = null;
}

// Render video preview and format list
function renderFormatSelection(info) {
    // Preview Column
    document.getElementById('preview-thumbnail').src = info.thumbnail || "";
    document.getElementById('preview-title').innerText = info.title;
    document.getElementById('preview-uploader').innerHTML = `
        <span class="material-symbols-outlined text-sm">person</span>
        ${info.uploader}
    `;
    
    const durationEl = document.getElementById('preview-duration');
    if (info.is_playlist) {
        durationEl.classList.add('hidden');
        document.getElementById('playlist-preview-info').classList.remove('hidden');
        document.getElementById('playlist-count').innerText = `${info.entries_count} videos in playlist`;
    } else {
        durationEl.classList.remove('hidden');
        durationEl.innerText = formatDuration(info.duration);
        document.getElementById('playlist-preview-info').classList.add('hidden');
    }

    // Formats List Column
    const container = document.getElementById('formats-list-container');
    container.innerHTML = '';

    info.formats.forEach(fmt => {
        const formatCard = document.createElement('div');
        formatCard.className = "group flex items-center justify-between p-4 rounded-2xl border border-outline-variant hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer";
        
        // Pick appropriate icon
        let icon = "hd";
        let iconColorClass = "text-on-secondary-container";
        let iconBgClass = "bg-secondary-container";

        if (fmt.audio_only) {
            icon = "audio_file";
            iconColorClass = "text-tertiary";
            iconBgClass = "bg-tertiary/10";
        } else if (fmt.height && fmt.height >= 2160) {
            icon = "high_quality";
            iconColorClass = "text-primary";
            iconBgClass = "bg-primary/10";
        }

        formatCard.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl ${iconBgClass} flex items-center justify-center ${iconColorClass}">
                    <span class="material-symbols-outlined">${icon}</span>
                </div>
                <div>
                    <p class="font-label-md text-label-md text-on-surface">${fmt.name}</p>
                    <p class="text-label-sm font-label-sm text-on-surface-variant">${fmt.filesize_str} • ${fmt.ext.toUpperCase()}</p>
                </div>
            </div>
            <button class="action-btn bg-surface-container-highest text-on-surface border border-outline-variant px-4 py-2 rounded-lg font-bold text-label-sm hover:bg-primary hover:text-on-primary hover:border-primary active:scale-95 transition-all">
                ${fmt.audio_only ? 'Extract' : 'Download'}
            </button>
        `;

        // Button action
        formatCard.querySelector('.action-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            startDownloadTask(info.url, fmt);
        });

        // Clicking card also triggers button
        formatCard.addEventListener('click', () => {
            formatCard.querySelector('.action-btn').click();
        });

        container.appendChild(formatCard);
    });
}

// Trigger Download API
async function startDownloadTask(url, format) {
    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                format_id: format.id,
                audio_only: format.audio_only,
                resolution: format.height ? `height_${format.height}` : format.id
            })
        });

        if (!res.ok) throw new Error("Failed to initialize download task on server");

        const data = await res.json();
        const taskId = data.task_id;

        // Register in local memory map
        activeDownloads.set(taskId, {
            title: fetchedInfo.title,
            thumbnail: fetchedInfo.thumbnail,
            formatName: format.name,
            audioOnly: format.audio_only,
            eventSource: null
        });

        // Initialize progress streaming
        connectProgressStream(taskId);
        
        // Reset subviews and tabs
        backToInput();
        navigateToTab('downloads');
    } catch (err) {
        showToast(err.message, "error");
    }
}

// SSE Connection for Live Progress
function connectProgressStream(taskId) {
    const taskDetails = activeDownloads.get(taskId);
    if (!taskDetails) return;

    const source = new EventSource(`/api/download/progress/${taskId}`);
    taskDetails.eventSource = source;

    // Create progress card in view
    createProgressCardDOM(taskId, taskDetails);
    updateActiveTasksBadge();

    source.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.status === 'ping') return; // keep-alive
        
        updateProgressCardDOM(taskId, data);

        if (data.status === 'completed') {
            source.close();
            activeDownloads.delete(taskId);
            updateActiveTasksBadge();
            loadHistory();
            showToast(`Download Complete: ${taskDetails.title.substring(0, 30)}...`, "success");
            
            // Add to session completed list
            addToSessionCompletedList(taskDetails, data.filename);
        } else if (data.status === 'failed') {
            source.close();
            updateActiveTasksBadge();
            showToast(`Download Failed: ${data.error || "Unknown Error"}`, "error");
        }
    };

    source.onerror = (err) => {
        console.error("SSE stream error", err);
        source.close();
        
        const errorData = {
            status: 'failed',
            percentage: 0,
            speed: '0 B/s',
            eta: '00:00',
            filename: '',
            error: "Connection lost with server"
        };
        updateProgressCardDOM(taskId, errorData);
        updateActiveTasksBadge();
    };
}

// Cancel / Abort Download
async function cancelDownloadTask(taskId) {
    const task = activeDownloads.get(taskId);
    if (!task) return;

    try {
        const res = await fetch(`/api/download/cancel/${taskId}`, { method: 'POST' });
        if (res.ok) {
            showToast("Download cancelled successfully", "success");
        } else {
            // Dismiss failed task card manually if it's already stopped
            removeProgressCardFromDOM(taskId);
        }
    } catch (err) {
        showToast("Error cancelling download", "error");
    }
}

// Active Downloads Badge
function updateActiveTasksBadge() {
    const count = activeDownloads.size;
    const badge = document.getElementById('downloads-badge');
    const badgeMobile = document.getElementById('downloads-badge-mobile');
    const countText = document.getElementById('active-tasks-count');

    if (countText) countText.innerText = `${count} Task${count !== 1 ? 's' : ''}`;

    [badge, badgeMobile].forEach(el => {
        if (el) {
            if (count > 0) {
                el.innerText = count;
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }
    });

    const emptyState = document.getElementById('downloads-empty-state');
    if (emptyState) {
        if (count > 0) {
            emptyState.classList.add('hidden');
        } else {
            emptyState.classList.remove('hidden');
        }
    }
}

// DOM Manipulations for Progress Cards
function createProgressCardDOM(taskId, details) {
    const container = document.getElementById('active-downloads-container');
    
    const card = document.createElement('div');
    card.id = `task-card-${taskId}`;
    card.className = "glass-card rounded-xl p-stack-md md:p-stack-lg transition-transform duration-300 hover:shadow-2xl animate-in slide-in-from-bottom-2";
    
    card.innerHTML = `
        <div class="flex flex-col md:flex-row gap-stack-md md:items-center">
            <!-- Thumbnail -->
            <div class="relative w-full md:w-56 h-32 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container-low">
                <img class="w-full h-full object-cover opacity-80" src="${details.thumbnail || ''}" alt="Media"/>
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase">
                    ${details.audioOnly ? 'MP3 Audio' : 'Video'}
                </div>
            </div>
            <!-- Details -->
            <div class="flex-grow min-w-0">
                <div class="flex justify-between items-start mb-base">
                    <h3 class="font-headline-md text-base md:text-lg font-semibold text-on-surface leading-tight line-clamp-1 truncate" title="${details.title}">
                        ${details.title}
                    </h3>
                    <span class="hidden md:block text-on-surface-variant text-label-sm font-medium flex-shrink-0 ml-4">${details.formatName}</span>
                </div>
                <div class="flex items-center gap-stack-sm mb-3">
                    <span class="flex h-2 w-2 rounded-full bg-primary animate-pulse status-dot"></span>
                    <span class="text-primary font-label-md status-text">Initializing...</span>
                </div>
                <!-- Progress Bar -->
                <div class="space-y-2">
                    <div class="flex justify-between items-end">
                        <span class="text-on-surface font-bold text-lg progress-pct">0%</span>
                        <div class="flex gap-stack-md text-on-surface-variant text-label-sm">
                            <span class="progress-speed">0 B/s</span>
                            <span class="text-outline select-none">•</span>
                            <span class="progress-eta">ETA: Calculating...</span>
                        </div>
                    </div>
                    <div class="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                        <div class="h-full bg-primary progress-glow rounded-full transition-all duration-500 ease-out progress-bar" style="width: 0%;"></div>
                    </div>
                </div>
            </div>
            <!-- Action Button -->
            <div class="md:pl-stack-lg flex-shrink-0 w-full md:w-auto">
                <button onclick="cancelDownloadTask('${taskId}')" class="cancel-btn w-full md:w-auto px-6 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-all duration-200 active:scale-95 font-label-md">
                    Cancel
                </button>
            </div>
        </div>
    `;

    container.appendChild(card);
}

function updateProgressCardDOM(taskId, data) {
    const card = document.getElementById(`task-card-${taskId}`);
    if (!card) return;

    const pBar = card.querySelector('.progress-bar');
    const pPct = card.querySelector('.progress-pct');
    const pSpeed = card.querySelector('.progress-speed');
    const pEta = card.querySelector('.progress-eta');
    const statusText = card.querySelector('.status-text');
    const statusDot = card.querySelector('.status-dot');
    const cancelBtn = card.querySelector('.cancel-btn');

    if (data.status === 'downloading') {
        statusText.innerText = 'Downloading...';
        statusDot.className = "flex h-2 w-2 rounded-full bg-primary animate-pulse status-dot";
        pPct.innerText = `${data.percentage}%`;
        pBar.style.width = `${data.percentage}%`;
        pSpeed.innerText = data.speed;
        pEta.innerText = `ETA: ${data.eta}`;
    } else if (data.status === 'merging') {
        statusText.innerText = 'Processing/Merging (FFmpeg)...';
        statusText.className = "text-tertiary font-label-md status-text";
        statusDot.className = "flex h-2 w-2 rounded-full bg-tertiary animate-pulse status-dot";
        pPct.innerText = `100%`;
        pBar.style.width = `100%`;
        pBar.className = "h-full bg-tertiary progress-glow rounded-full transition-all duration-500 ease-out progress-bar animate-pulse";
        pSpeed.innerText = "Processing...";
        pEta.innerText = "A few seconds remaining";
    } else if (data.status === 'completed') {
        statusText.innerText = 'Completed!';
        statusText.className = "text-green-500 font-label-md status-text";
        statusDot.className = "flex h-2 w-2 rounded-full bg-green-500 status-dot";
        pPct.innerText = `100%`;
        pBar.style.width = `100%`;
        pBar.className = "h-full bg-green-500 rounded-full progress-bar";
        pSpeed.innerText = "Done";
        pEta.innerText = "";
        
        // Remove cancel button, since it finished
        cancelBtn.parentElement.innerHTML = `
            <div class="flex flex-col sm:flex-row md:flex-col gap-2 w-full">
                <button onclick="openDownloadsFolder()" class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-all active:scale-95 font-label-md text-sm flex items-center justify-center gap-1.5">
                    <span class="material-symbols-outlined text-sm">folder</span> Show
                </button>
                <a href="/downloads/${encodeURIComponent(data.filename)}" download class="px-4 py-2 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-highest transition-all text-center font-label-md text-sm flex items-center justify-center gap-1.5">
                    <span class="material-symbols-outlined text-sm">open_in_new</span> Save As
                </a>
            </div>
        `;
    } else if (data.status === 'failed') {
        statusText.innerText = `Failed: ${data.error || 'Unknown Error'}`;
        statusText.className = "text-error font-label-md status-text break-all line-clamp-2 max-w-lg";
        statusDot.className = "flex h-2 w-2 rounded-full bg-error status-dot";
        pBar.className = "h-full bg-error rounded-full progress-bar";
        pSpeed.innerText = "Error";
        pEta.innerText = "";
        
        cancelBtn.innerText = "Dismiss";
        cancelBtn.className = "w-full md:w-auto px-6 py-2 rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-200 active:scale-95 font-label-md";
        cancelBtn.setAttribute('onclick', `removeProgressCardFromDOM('${taskId}')`);
    }
}

function removeProgressCardFromDOM(taskId) {
    const card = document.getElementById(`task-card-${taskId}`);
    if (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(15px)';
        card.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            card.remove();
            updateActiveTasksBadge();
        }, 300);
    }
}

// Add completed items to the top summary in Downloads View
function addToSessionCompletedList(details, filename) {
    const container = document.getElementById('recent-session-downloads');
    const emptyState = document.getElementById('downloads-empty-state');
    
    // Hide empty state if there's text
    if (emptyState) emptyState.classList.add('hidden');

    const item = document.createElement('div');
    item.className = "group flex items-center gap-stack-md p-stack-md bg-surface-container-low hover:bg-surface-container-high rounded-xl border border-outline-variant transition-colors duration-200 cursor-pointer animate-in fade-in";
    
    item.innerHTML = `
        <div class="w-20 h-12 rounded bg-surface-container-highest flex-shrink-0 overflow-hidden">
            <img class="w-full h-full object-cover" src="${details.thumbnail || ''}" alt="Media"/>
        </div>
        <div class="flex-grow min-w-0">
            <h4 class="text-on-surface font-label-md truncate">${details.title}</h4>
            <p class="text-on-surface-variant text-label-sm">${details.formatName} • Completed just now</p>
        </div>
        <div class="flex items-center gap-stack-sm">
            <a href="/downloads/${encodeURIComponent(filename)}" target="_blank" class="p-2 text-primary hover:bg-primary/10 rounded-full" title="Play/Open in browser">
                <span class="material-symbols-outlined text-lg">open_in_new</span>
            </a>
            <button onclick="openDownloadsFolder()" class="p-2 text-on-surface-variant hover:bg-surface-container-highest rounded-full" title="Open folder">
                <span class="material-symbols-outlined text-lg">folder</span>
            </button>
        </div>
    `;

    // Prepend to show newest first
    container.insertBefore(item, container.firstChild);
}

// Fetch and load historical downloads
async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        if (!res.ok) throw new Error();
        const historyList = await res.json();
        renderHistoryList(historyList);
    } catch (err) {
        console.error("Failed to load history", err);
    }
}

function renderHistoryList(historyList) {
    const container = document.getElementById('history-list-container');
    const emptyState = document.getElementById('history-empty-state');

    // Filter list
    if (historyList.length === 0) {
        emptyState.classList.remove('hidden');
        // Clear old list rows except empty state
        document.querySelectorAll('#history-list-container .history-row').forEach(row => row.remove());
        return;
    }

    emptyState.classList.add('hidden');
    // Clear old list rows
    document.querySelectorAll('#history-list-container .history-row').forEach(row => row.remove());

    historyList.forEach(item => {
        const row = document.createElement('div');
        row.className = "history-row glass-card flex items-center gap-stack-md p-stack-md rounded-xl hover:bg-surface-container-high transition-colors duration-200 group";
        
        const durationStr = formatDuration(item.duration);
        const sizeStr = item.filesize > 0 ? formatBytes(item.filesize) : "Unknown size";
        const dateStr = timeAgo(item.download_date);
        
        let pathBadge = "";
        let openBtnClass = "text-on-surface-variant hover:bg-primary-container hover:text-on-primary-container";
        let playLinkHTML = "";

        if (item.file_exists) {
            // File is present locally, link directly to serve endpoint
            playLinkHTML = `
                <a href="/downloads/${encodeURIComponent(item.filename)}" target="_blank" class="p-2 text-primary hover:bg-primary/10 rounded-full" title="Play/Preview in browser">
                    <span class="material-symbols-outlined text-lg">play_arrow</span>
                </a>
            `;
        } else {
            // File is deleted or moved
            pathBadge = `<span class="text-[9px] font-semibold text-error px-1.5 py-0.2 rounded bg-error/10 uppercase tracking-wider ml-2">File Moved/Deleted</span>`;
            openBtnClass = "text-outline opacity-40 cursor-not-allowed";
        }

        row.innerHTML = `
            <!-- Thumbnail -->
            <div class="relative w-24 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-surface-container-highest">
                <img class="w-full h-full object-cover" src="${item.thumbnail || ''}" alt="Thumbnail"/>
                <div class="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[10px] font-bold text-white">${durationStr}</div>
            </div>
            <!-- Metadata -->
            <div class="flex-grow min-w-0">
                <h3 class="font-label-md text-label-md text-on-surface truncate pr-2" title="${item.title}">${item.title}</h3>
                <div class="flex flex-wrap items-center gap-2 mt-base text-on-surface-variant font-label-sm text-label-sm">
                    <span>${item.audio_only ? 'Audio MP3' : 'Video MP4'}</span>
                    <span class="w-1 h-1 rounded-full bg-outline"></span>
                    <span>${sizeStr}</span>
                    <span class="w-1 h-1 rounded-full bg-outline"></span>
                    <span>${dateStr}</span>
                    ${pathBadge}
                </div>
            </div>
            <!-- Actions -->
            <div class="flex items-center gap-stack-sm">
                ${playLinkHTML}
                <button onclick="${item.file_exists ? 'openDownloadsFolder()' : ''}" class="p-stack-sm rounded-lg border border-outline-variant ${openBtnClass} transition-all active:scale-95 flex items-center justify-center" title="Open in explorer">
                    <span class="material-symbols-outlined text-base">folder</span>
                </button>
                <button onclick="deleteHistoryItem('${item.id}', ${item.file_exists})" class="p-stack-sm rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center" title="Delete record">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>
            </div>
        `;

        container.appendChild(row);
    });
}

// Delete History item
async function deleteHistoryItem(itemId, fileExists) {
    let confirmMsg = "Are you sure you want to delete this download record?";
    if (fileExists) {
        confirmMsg = "Delete this download record? Click 'OK' to delete from history and remove the local file on disk.";
    }

    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`/api/history/${itemId}?delete_file=true`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Item deleted successfully", "success");
            loadHistory();
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast("Failed to delete history item", "error");
    }
}

// Local Folder Trigger
async function openDownloadsFolder() {
    try {
        const res = await fetch('/api/open-folder', { method: 'POST' });
        if (res.ok) {
            showToast("Downloads folder opened", "success");
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast("Could not open downloads directory", "error");
    }
}

// Search filter
function handleHistorySearch(e) {
    const query = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#history-list-container .history-row');
    
    rows.forEach(row => {
        const title = row.querySelector('h3').innerText.toLowerCase();
        if (title.includes(query)) {
            row.style.display = 'flex';
        } else {
            row.style.display = 'none';
        }
    });
}

// Toast Helper
let toastTimeout;
function showToast(message, type = "error") {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');

    toastMsg.innerText = message;
    
    if (type === "success") {
        toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-primary-container text-on-primary-container border border-primary px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300";
        toast.querySelector('.material-symbols-outlined').innerText = "check_circle";
    } else {
        toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-error-container text-on-error-container border border-error px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300";
        toast.querySelector('.material-symbols-outlined').innerText = "error";
    }

    toast.classList.remove('hidden');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(hideToast, 5000);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.classList.add('hidden');
}

// Helper Utilities
function formatDuration(seconds) {
    if (!seconds) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const sStr = s < 10 ? `0${s}` : s;
    if (h > 0) {
        const mStr = m < 10 ? `0${m}` : m;
        return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function timeAgo(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return "just now";
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    
    // Otherwise return clean date
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
