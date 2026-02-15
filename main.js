const { app, BrowserWindow } = require("electron");
const path = require("path");

const PORT = 3001;

require("./server");

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        frame: true,
        backgroundColor: "#0a0a0a",
        webPreferences: {
            contextIsolation: true,
        },
    });

    win.loadURL(`http://localhost:${PORT}`);
    win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    app.quit();
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
