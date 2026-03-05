const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

// Start the Express server
const server = require('./server');
const PORT = 3000;
let mainWindow;

// Auto-updater (only works in packaged app)
function setupAutoUpdater() {
  try {
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Dostupná aktualizace',
        message: `Je dostupná nová verze ${info.version}. Chcete ji stáhnout?`,
        buttons: ['Stáhnout', 'Později']
      }).then(result => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    });

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Aktualizace připravena',
        message: 'Aktualizace byla stažena. Aplikace se restartuje a nainstaluje ji.',
        buttons: ['Restartovat', 'Později']
      }).then(result => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });

    autoUpdater.on('error', (err) => {
      console.log('Auto-update error:', err.message);
    });

    // Check for updates after 5 seconds
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);
  } catch (e) {
    // electron-updater not available in dev mode
    console.log('Auto-updater not available:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Progresklima — Evidence',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Start Express server
  const srv = server.listen(PORT, () => {
    console.log(`Server běží na http://localhost:${PORT}`);
    createWindow();
    setupAutoUpdater();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    srv.close();
    if (process.platform !== 'darwin') app.quit();
  });
});
