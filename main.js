const { app, BrowserWindow } = require('electron');
const path = require('path');

// Start the Express server
const server = require('./server');
const PORT = 3000;
let mainWindow;

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
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    srv.close();
    if (process.platform !== 'darwin') app.quit();
  });
});
