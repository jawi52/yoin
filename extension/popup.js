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
    if (!val) val = 'http://localhost:8000';
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
    if (online && activeVideoUrl) {
      fetchAndRenderFormats(activeVideoUrl);
    } else if (!online) {
      renderOfflineState();
    }
  });

  openAppBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: SERVER_URL });
  });

  const serverOnline = await checkServerStatus();
  if (!serverOnline) {
    renderOfflineState();
    return;
  }

  // Get active tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab || !activeTab.url) {
      renderNotYouTubeState();
      return;
    }

    const url = activeTab.url;
    if (isYouTubeUrl(url)) {
      activeVideoUrl = url;
      fetchAndRenderFormats(url);
    } else {
      renderNotYouTubeState();
    }
  });
});

async function checkServerStatus() {
  const statusBadge = document.getElementById('server-status');
  const statusText = document.getElementById('status-text');
  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    if (res.ok) {
      statusBadge.className = 'status-badge status-online';
      statusText.innerText = 'Server Online';
      return true;
    }
  } catch (err) {
    // Offline
  }
  statusBadge.className = 'status-badge status-offline';
  statusText.innerText = 'Server Offline';
  return false;
}

function isYouTubeUrl(url) {
  return url.includes('youtube.com/watch') || 
         url.includes('youtube.com/shorts/') || 
         url.includes('youtu.be/');
}

async function fetchAndRenderFormats(url) {
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
      const errData = await res.json();
      throw new Error(errData.detail || "Failed to fetch video info.");
    }

    const info = await res.json();
    renderVideoFormats(info);
  } catch (err) {
    content.innerHTML = `
      <div class="notice-box">
        <span class="material-symbols-outlined" style="font-size:32px; color:#f87171; margin-bottom:8px;">error</span>
        <p style="color:#f87171; font-weight:600; margin-bottom:4px;">Failed to load video</p>
        <p style="font-size:11px;">${err.message}</p>
      </div>
    `;
  }
}

function renderVideoFormats(info) {
  const content = document.getElementById('content');

  let formatsHTML = '';
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
      <div style="font-size:11px; font-weight:700; color:#8083ff; margin-bottom:8px; text-transform:uppercase; tracking-wider:1px;">Select Quality to Download:</div>
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
      </div>
    </div>
  `;

  // Attach button click events
  content.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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
  if (progressArea) progressArea.style.display = 'flex';

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

    if (!res.ok) throw new Error("Failed to start download task.");

    const data = await res.json();
    const taskId = data.task_id;

    // Connect SSE EventSource
    connectProgress(taskId);
  } catch (err) {
    const pStatus = document.getElementById('p-status');
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

  const source = new EventSource(`${SERVER_URL}/api/download/progress/${taskId}`);

  source.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === 'downloading') {
      pStatus.innerText = 'Downloading...';
      pPct.innerText = `${data.percentage}%`;
      pBar.style.width = `${data.percentage}%`;
      pSpeed.innerText = data.speed;
      pEta.innerText = `ETA: ${data.eta}`;
    } else if (data.status === 'merging') {
      pStatus.innerText = 'Processing / Merging...';
      pPct.innerText = '100%';
      pBar.style.width = '100%';
      pSpeed.innerText = 'Finalizing...';
    } else if (data.status === 'completed') {
      source.close();
      pStatus.innerText = 'Download Complete!';
      pStatus.style.color = '#4ade80';
      pPct.innerText = '100%';
      pBar.style.width = '100%';
      pSpeed.innerText = 'Done';
      pEta.innerText = '';
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
      <p style="color:#e2e8f0; font-weight:600; margin-bottom:4px;">No YouTube Video Detected</p>
      <p>Open any YouTube video or Shorts tab, then click this Yoin icon to download in one click!</p>
    </div>
  `;
}

function renderOfflineState() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="notice-box">
      <span class="material-symbols-outlined" style="font-size:36px; color:#f87171; margin-bottom:8px;">power_off</span>
      <p style="color:#f87171; font-weight:600; margin-bottom:4px;">Server Offline / Not Connected</p>
      <p>Click the gear icon above to check or update your Yoin server URL, or start your local server.</p>
    </div>
  `;
}
