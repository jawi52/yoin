let SERVER_URL = localStorage.getItem('yoin_server_url') || 'https://yoin.eu.cc';
let activeVideoUrl = null;

document.addEventListener('DOMContentLoaded', async () => {
  const openAppBtn = document.getElementById('open-app-btn');
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const serverUrlInput = document.getElementById('server-url-input');
  const saveServerUrlBtn = document.getElementById('save-server-url-btn');

  serverUrlInput.value = SERVER_URL;

  settingsToggleBtn.addEventListener('click', () => {
    const isHidden = settingsPanel.style.display === 'none';
    settingsPanel.style.display = isHidden ? 'block' : 'none';
  });

  saveServerUrlBtn.addEventListener('click', async () => {
    let val = serverUrlInput.value.trim();
    if (!val) val = 'https://yoin.eu.cc';
    if (!val.startsWith('http://') && !val.startsWith('https://')) {
      val = 'https://' + val;
    }
    // Remove trailing slash
    val = val.replace(/\/+$/, '');
    SERVER_URL = val;
    localStorage.setItem('yoin_server_url', SERVER_URL);
    serverUrlInput.value = SERVER_URL;
    settingsPanel.style.display = 'none';

    // Re-check
    const online = await checkServerStatus();
    if (online) {
      if (activeVideoUrl) {
        fetchAndRenderFormats(activeVideoUrl);
      } else {
        detectTabOrRenderInput();
      }
    } else {
      renderOfflineState();
    }
  });

  openAppBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: SERVER_URL });
  });

  const serverOnline = await checkServerStatus();
  if (!serverOnline) {
    // Attempt fallback to localhost if default cloud was unreachable
    if (SERVER_URL.includes('yoin.eu.cc')) {
      const localOnline = await testServerConnection('http://localhost:8000');
      if (localOnline) {
        SERVER_URL = 'http://localhost:8000';
        localStorage.setItem('yoin_server_url', SERVER_URL);
        serverUrlInput.value = SERVER_URL;
        updateStatusBadge(true);
      } else {
        renderOfflineState();
        return;
      }
    } else {
      renderOfflineState();
      return;
    }
  }

  detectTabOrRenderInput();
});

async function detectTabOrRenderInput() {
  // Get active tab URL
  if (chrome && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs && tabs[0];
      const url = activeTab ? activeTab.url : null;
      if (url && isYouTubeUrl(url)) {
        activeVideoUrl = url;
        fetchAndRenderFormats(url);
      } else {
        renderNotYouTubeState();
      }
    });
  } else {
    renderNotYouTubeState();
  }
}

async function testServerConnection(url) {
  try {
    const res = await fetch(`${url}/api/status`, { cache: 'no-store' });
    return res.ok;
  } catch (err) {
    return false;
  }
}

function updateStatusBadge(online) {
  const statusBadge = document.getElementById('server-status');
  const statusText = document.getElementById('status-text');
  if (online) {
    statusBadge.className = 'status-badge status-online';
    statusText.innerText = 'Online';
  } else {
    statusBadge.className = 'status-badge status-offline';
    statusText.innerText = 'Offline';
  }
}

async function checkServerStatus() {
  const isOnline = await testServerConnection(SERVER_URL);
  updateStatusBadge(isOnline);
  return isOnline;
}

function isYouTubeUrl(url) {
  if (!url) return false;
  return url.includes('youtube.com/watch') || 
         url.includes('youtube.com/shorts/') || 
         url.includes('youtu.be/');
}

async function fetchAndRenderFormats(url) {
  activeVideoUrl = url;
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="loader">
      <span class="material-symbols-outlined spin">sync</span>
      <span>Fetching video info & formats...</span>
    </div>
  `;

  try {
    const res = await fetch(`${SERVER_URL}/api/info?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      let errorMsg = "Failed to fetch video info.";
      try {
        const errData = await res.json();
        errorMsg = errData.detail || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const info = await res.json();
    renderVideoFormats(info);
  } catch (err) {
    content.innerHTML = `
      <div class="notice-box">
        <span class="material-symbols-outlined" style="font-size:32px; color:#f87171; margin-bottom:8px;">error</span>
        <p style="color:#f87171; font-weight:600; margin-bottom:4px;">Failed to load video</p>
        <p style="font-size:11px; margin-bottom:12px;">${err.message}</p>
        <button id="retry-btn" class="settings-save-btn" style="padding:6px 16px;">Try Again</button>
      </div>
    `;
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => fetchAndRenderFormats(url));
    }
  }
}

function renderVideoFormats(info) {
  const content = document.getElementById('content');

  let formatsHTML = '';
  if (info.formats && info.formats.length > 0) {
    info.formats.forEach(fmt => {
      const badgeText = fmt.audio_only ? 'MP3' : (fmt.height ? `${fmt.height}p` : 'MP4');
      formatsHTML += `
        <button class="format-btn" data-fmt-id="${fmt.id}" data-audio="${fmt.audio_only}" data-height="${fmt.height || ''}">
          <span class="fmt-label">
            <span class="badge">${badgeText}</span>
            <span>${fmt.name}</span>
          </span>
          <span style="color:#94a3b8; font-size:11px;">${fmt.filesize_str || ''}</span>
        </button>
      `;
    });
  } else {
    formatsHTML = `<div style="font-size:12px; color:#94a3b8; text-align:center; padding:10px;">No formats detected.</div>`;
  }

  content.innerHTML = `
    <div class="glass-card">
      <div class="preview">
        <img class="thumbnail" src="${info.thumbnail || ''}" alt="Thumbnail"/>
        <div class="meta">
          <div class="title" title="${info.title}">${info.title}</div>
          <div class="uploader">
            <span class="material-symbols-outlined" style="font-size:12px;">person</span>
            <span>${info.uploader}</span>
          </div>
        </div>
      </div>
      <div style="font-size:11px; font-weight:700; color:#8083ff; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">Select Quality to Download:</div>
      <div class="format-section">
        ${formatsHTML}
      </div>
      <div id="progress-area" style="display:none;" class="progress-box">
        <div class="p-text">
          <span id="p-status">Starting download...</span>
          <span id="p-pct">0%</span>
        </div>
        <div class="bar-bg">
          <div id="p-bar" class="bar-fill"></div>
        </div>
        <div class="p-text">
          <span id="p-speed">0 B/s</span>
          <span id="p-eta">ETA: --:--</span>
        </div>
        <div id="completed-action-area" style="display:none; margin-top:8px;"></div>
      </div>
    </div>
  `;

  // Attach button click events
  content.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Disable other buttons while downloading
      content.querySelectorAll('.format-btn').forEach(b => b.style.opacity = '0.5');
      btn.style.opacity = '1';
      btn.style.borderColor = '#8083ff';

      const fmtId = btn.getAttribute('data-fmt-id');
      const audioOnly = btn.getAttribute('data-audio') === 'true';
      const height = btn.getAttribute('data-height');
      const resolution = height ? `height_${height}` : fmtId;
      startDownload(info.url, fmtId, audioOnly, resolution);
    });
  });
}

async function startDownload(url, formatId, audioOnly, resolution) {
  const progressArea = document.getElementById('progress-area');
  const pStatus = document.getElementById('p-status');
  const completedArea = document.getElementById('completed-action-area');
  if (completedArea) completedArea.style.display = 'none';

  if (progressArea) progressArea.style.display = 'flex';
  if (pStatus) {
    pStatus.innerText = 'Requesting server...';
    pStatus.style.color = '#8083ff';
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        format_id: formatId,
        audio_only: audioOnly,
        resolution: resolution
      })
    });

    if (!res.ok) {
      let errMsg = "Failed to start download task.";
      try {
        const d = await res.json();
        errMsg = d.detail || errMsg;
      } catch (e) {}
      throw new Error(errMsg);
    }

    const data = await res.json();
    const taskId = data.task_id;

    // Connect SSE EventSource
    connectProgress(taskId);
  } catch (err) {
    if (pStatus) {
      pStatus.innerText = `Error: ${err.message}`;
      pStatus.style.color = '#f87171';
    }
  }
}

function connectProgress(taskId) {
  const pStatus = document.getElementById('p-status');
  const pPct = document.getElementById('p-pct');
  const pBar = document.getElementById('p-bar');
  const pSpeed = document.getElementById('p-speed');
  const pEta = document.getElementById('p-eta');
  const completedArea = document.getElementById('completed-action-area');

  const source = new EventSource(`${SERVER_URL}/api/download/progress/${taskId}`);

  source.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === 'ping') return;

    if (data.status === 'downloading') {
      pStatus.innerText = 'Downloading...';
      pStatus.style.color = '#dae2fd';
      pPct.innerText = `${data.percentage}%`;
      pBar.style.width = `${data.percentage}%`;
      pSpeed.innerText = data.speed;
      pEta.innerText = `ETA: ${data.eta}`;
    } else if (data.status === 'merging') {
      pStatus.innerText = 'Processing / Merging (FFmpeg)...';
      pStatus.style.color = '#ffdcc5';
      pPct.innerText = '100%';
      pBar.style.width = '100%';
      pSpeed.innerText = 'Processing...';
      pEta.innerText = 'Almost ready';
    } else if (data.status === 'completed') {
      source.close();
      pStatus.innerText = 'Download Complete!';
      pStatus.style.color = '#4ade80';
      pPct.innerText = '100%';
      pBar.style.width = '100%';
      pSpeed.innerText = 'Saved';
      pEta.innerText = '';

      const downloadUrl = `${SERVER_URL}/api/download/file/${encodeURIComponent(data.filename)}`;

      // Auto-trigger browser download to user PC
      if (chrome && chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download({
          url: downloadUrl,
          filename: data.filename,
          saveAs: false,
          conflictAction: 'uniquify'
        }, (id) => {
          if (chrome.runtime.lastError) {
            console.warn("chrome.downloads lastError:", chrome.runtime.lastError.message);
          }
        });
      }

      if (completedArea) {
        completedArea.style.display = 'block';
        completedArea.innerHTML = `
          <a href="${downloadUrl}" download="${encodeURIComponent(data.filename)}" target="_blank" class="btn-open-app" style="background:#4ade80; color:#0b1326; text-decoration:none; margin-top:8px; font-weight:700;">
            <span class="material-symbols-outlined">download</span>
            <span>Save to Computer</span>
          </a>
        `;
      }
    } else if (data.status === 'failed') {
      source.close();
      pStatus.innerText = `Failed: ${data.error || 'Unknown Error'}`;
      pStatus.style.color = '#f87171';
    }
  };

  source.onerror = () => {
    source.close();
  };
}

function renderNotYouTubeState() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="notice-box">
      <span class="material-symbols-outlined" style="font-size:36px; color:#8083ff; margin-bottom:8px;">smart_display</span>
      <p style="color:#e2e8f0; font-weight:600; margin-bottom:4px;">Paste YouTube Video Link</p>
      <p style="font-size:11px; margin-bottom:12px;">Open a YouTube tab or paste any YouTube URL below to download directly:</p>
      
      <div class="settings-input-group" style="margin-bottom:8px;">
        <input id="manual-url-input" class="settings-input" type="text" placeholder="https://youtube.com/watch?v=..."/>
        <button id="manual-fetch-btn" class="settings-save-btn">Fetch</button>
      </div>
    </div>
  `;

  const manualFetchBtn = document.getElementById('manual-fetch-btn');
  const manualUrlInput = document.getElementById('manual-url-input');
  if (manualFetchBtn && manualUrlInput) {
    manualFetchBtn.addEventListener('click', () => {
      const url = manualUrlInput.value.trim();
      if (url && isYouTubeUrl(url)) {
        fetchAndRenderFormats(url);
      } else {
        manualUrlInput.style.borderColor = '#f87171';
      }
    });

    manualUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        manualFetchBtn.click();
      }
    });
  }
}

function renderOfflineState() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="notice-box">
      <span class="material-symbols-outlined" style="font-size:36px; color:#f87171; margin-bottom:8px;">power_off</span>
      <p style="color:#f87171; font-weight:600; margin-bottom:4px;">Server Offline / Not Connected</p>
      <p style="font-size:11px; margin-bottom:12px;">Cannot connect to <code>${SERVER_URL}</code>.<br/>Click the gear icon above to update your server URL or check your local server.</p>
      <button id="reconnect-btn" class="settings-save-btn" style="padding:6px 16px;">Check Connection</button>
    </div>
  `;

  const reconnectBtn = document.getElementById('reconnect-btn');
  if (reconnectBtn) {
    reconnectBtn.addEventListener('click', async () => {
      const isOnline = await checkServerStatus();
      if (isOnline) {
        detectTabOrRenderInput();
      }
    });
  }
}
