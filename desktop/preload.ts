import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('trafficLightDesktop', {
  getConnection: () => ipcRenderer.invoke('bridge:get-connection'),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:set-always-on-top', value),
  isAlwaysOnTop: () => ipcRenderer.invoke('window:is-always-on-top'),
  setExpanded: (value: boolean, reduceMotion: boolean, preferredSize?: { width: number; height: number }) => ipcRenderer.invoke('window:set-expanded', value, reduceMotion, preferredSize),
  close: () => ipcRenderer.send('window:close')
});
