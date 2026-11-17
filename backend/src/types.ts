import { Server, Socket } from "socket.io";

export interface UserCountData {
  ready: number;
  total: number;
}

export interface ServerToClientEvents {
  "user-count": (data: UserCountData) => void;
  "user-connected": (message: string) => void;
  "user-disconnected": (message: string) => void;
  "video-selected-server": (videoName: string) => void;
  "video-seeking-server": (currentTime: number) => void;
  "video-paused-server": (currentTime: number) => void;
  "video-played-server": (currentTime: number) => void;
}

export interface ClientToServerEvents {
  "join-room": (roomName: string) => void;
  "user-ready-click": () => void;
  "video-selected-client": (videoName: string) => void;
  "video-seeking-client": (currentTime: number) => void;
  "video-paused-client": (currentTime: number) => void;
  "video-played-client": (currentTime: number) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  isReady: boolean;
  currentRoom?: string;
}

declare module "socket.io" {
  interface Socket {
    currentRoom?: string;
  }
}

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
