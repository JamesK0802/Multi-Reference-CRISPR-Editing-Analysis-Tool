const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

let backendProcess = null;

/**
 * 1. Backend Readiness Polling
 * Checks if the backend is responding before creating the window.
 */
function waitForBackend(callback, retries = 30) {
  if (retries === 0) {
    console.error('[Electron] Backend failed to start in time.');
    app.quit();
    return;
  }

  const req = http.get('http://127.0.0.1:8000/docs', (res) => {
    console.log('[Electron] Backend is ready. Opening window...');
    isBackendReady = true;
    callback();
  });

  req.on('error', () => {
    console.log(`[Electron] Waiting for backend... (${retries} retries left)`);
    setTimeout(() => waitForBackend(callback, retries - 1), 1000);
  });
}

function startBackend() {
  const isWin = process.platform === 'win32';
  const isPackaged = app.isPackaged;

  let cmd;
  let args;
  let backendDir;

  if (isPackaged) {
    // ── Packaged Mode: Run standalone executable ─────────────────────────────
    backendDir = path.join(process.resourcesPath, 'backend');
    cmd = isWin
      ? path.join(backendDir, 'backend-api.exe')
      : path.join(backendDir, 'backend-api');
    args = [];

    console.log(`[Electron] Starting standalone backend: ${cmd}`);
  } else {
    // ── Dev Mode: Run via Python interpreter ────────────────────────────────
    backendDir = path.join(__dirname, '..', 'crispr_backend');
    const venvPath = isWin
      ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
      : path.join(backendDir, 'venv', 'bin', 'python3');

    cmd = fs.existsSync(venvPath) ? venvPath : (isWin ? 'python' : 'python3');
    args = ['-m', 'uvicorn', 'api:app', '--port', '8000'];

    console.log(`[Electron] Starting Dev backend using: ${cmd}`);
  }

  backendProcess = spawn(cmd, args, {
    cwd: backendDir,
    shell: isWin,
    detached: !isWin
  });

  backendProcess.stdout.on('data', (data) => {
    process.stdout.write(`[Backend STDOUT] ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    process.stderr.write(`[Backend STDERR] ${data}`);
  });

  backendProcess.on('error', (err) => {
    console.error(`[Electron] Failed to start backend: ${err.message}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`[Electron] Backend process exited with code ${code}`);
  });
}

/**
 * 3. Improved Shutdown Handling
 * Ensures backend process tree is killed properly on all platforms.
 */
function killBackend() {
  if (!backendProcess) return;
  console.log('[Electron] Terminating backend process...');

  if (process.platform === 'win32') {
    // On Windows, use taskkill to kill the tree
    spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
  } else {
    // On Unix, kill the process group (works since we used detached: true)
    try {
      process.kill(-backendProcess.pid, 'SIGKILL');
    } catch (e) {
      backendProcess.kill('SIGKILL');
    }
  }
  backendProcess = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  /**
   * 2. Dev vs Packaged Mode
   */
  if (!app.isPackaged) {
    // Optionally toggle this to false to test built files locally:
    const testBuiltFiles = true;
    if (testBuiltFiles) {
      win.loadFile(path.join(__dirname, '..', 'crispr-frontend', 'dist', 'crispr-frontend', 'browser', 'index.html'));
    } else {
      win.loadURL('http://localhost:4200');
    }
  } else {
    // Packaged mode path (index.html is moved to 'dist' folder inside the app bundle)
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  win.on('closed', () => {
    killBackend();
  });
}

// Global Lifecycle
app.whenReady().then(() => {
  startBackend();
  waitForBackend(createWindow);

  // ── Automatic Updates ─────────────────────────────────────────────────────
  // NOTE: On macOS, auto-updates REQUIRE the app to be code signed with a
  // valid Apple Developer ID. Without it, the update will download but fail 
  // to verify and install.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

// Update event handlers
autoUpdater.on('update-available', () => {
  console.log('[AutoUpdate] Update available. Downloading...');
});

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdate] Error:', err);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdate] Update downloaded. Version:', info.version);
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded. Restart now to install?',
    buttons: ['Restart', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

app.on('will-quit', () => {
  killBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let isBackendReady = false;

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && isBackendReady) {
    createWindow();
  }
});