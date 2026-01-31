export interface FileSystemNode {
  name: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileSystemNode[];
}

export interface TerminalState {
  history: string[];
  currentPath: string;
  user: string;
  hostname: string;
}

export enum GameStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  BREACHING = 'BREACHING',
}