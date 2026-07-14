import type { AutoConnectResult, DetectedAgent } from './agentAutoConnector';
import type { PanelSize } from './panelSizing';

export type ConnectionInfo = { endpoint: string; token: string; protocol?: 'agent-light/1' | 'terminal/1'; capturePath?: string };

declare global {
  interface Window {
    trafficLightDesktop: {
      getConnection(): Promise<ConnectionInfo>;
      setAlwaysOnTop(value: boolean): Promise<boolean>;
      isAlwaysOnTop(): Promise<boolean>;
      setExpanded(value: boolean, reduceMotion: boolean, preferredSize?: PanelSize): Promise<boolean>;
      openSettings(): void;
      scanAgents(): Promise<DetectedAgent[]>;
      connectAgents(): Promise<AutoConnectResult>;
      capture(path: string): Promise<boolean>;
      close(): void;
    };
  }
}

export {};
