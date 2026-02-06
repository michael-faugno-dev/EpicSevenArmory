const { ipcRenderer } = require('electron');

// Example of using ipcRenderer to send/receive messages
ipcRenderer.on('update', (event, data) => {
  console.log('Update received:', data);
  // Handle the data received and update the state/UI
});
