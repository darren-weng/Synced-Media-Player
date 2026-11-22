import express, { Request, Response } from "express";
import http from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import { HTML_DIR, VIDEO_DIR } from "./paths";
import {
  ChatMessage,
  ClientChatMessageData,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
  TypedServer,
  TypedSocket,
} from "./types";
import { getVideoList } from "./vidSelect";

export const app = express();
export const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export const server = http.createServer(app);
export const io: TypedServer = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server);

// Static files
app.use(express.static(HTML_DIR, { index: false }));

// Protect /videos: allow streaming local server files only for the "server" room
app.use("/videos", (req: Request, res: Response, next) => {
  const roomQuery = typeof req.query.room === "string" ? req.query.room.toLowerCase() : "";
  const referer = req.headers.referer || "";
  let refererRoom = "";
  try {
    if (referer) {
      refererRoom = new URL(referer, `http://${req.headers.host}`).pathname.substring(1).toLowerCase();
    }
  } catch {
    // Ignore URL parse error
  }

  const isServerRoom = roomQuery === "server" || refererRoom === "server";

  if (isServerRoom) {
    return next();
  }

  res.status(403).send("Access to local server videos is restricted to the 'server' room.");
}, express.static(VIDEO_DIR));

interface RoomState {
  currentVideo?: string;
  currentTime?: number;
  isPlaying?: boolean;
  lastPlayTimestamp?: number;
  messages: ChatMessage[];
}

const roomStates = new Map<string, RoomState>();

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/**
 * Broadcasts the current ready and total user count to all sockets in a room.
 */
export function broadcastUserCount(serverIo: TypedServer, roomName?: string): void {
  if (!roomName) return;

  const roomSocketIds = serverIo.sockets.adapter.rooms.get(roomName);
  const totalUsers = roomSocketIds?.size ?? 0;

  // Count how many of the currently connected sockets are ready
  let readyCount = 0;

  if (roomSocketIds) {
    roomSocketIds.forEach((socketId) => {
      const socket = serverIo.sockets.sockets.get(socketId);
      if (socket?.data.isReady) {
        readyCount++;
      }
    });
  }

  serverIo.to(roomName).emit("user-count", { ready: readyCount, total: totalUsers });
}

io.on("connection", (socket: TypedSocket) => {
  // Initialize the ready status for this socket
  socket.data.isReady = false;

  // Client tells the server which room they belong to
  socket.on("join-room", (roomName: string) => {
    if (typeof roomName !== "string") return;
    const cleanRoom = roomName.trim().slice(0, 100);
    if (!cleanRoom) return;

    socket.join(cleanRoom);
    socket.currentRoom = cleanRoom;
    socket.data.currentRoom = cleanRoom;
    console.log(`User ${socket.id} joined room: ${cleanRoom}`);

    const roomSocketIds = io.sockets.adapter.rooms.get(cleanRoom);
    const totalUsersInRoom = roomSocketIds?.size ?? 1;

    let state = roomStates.get(cleanRoom);
    if (!state) {
      state = { messages: [] };
      roomStates.set(cleanRoom, state);
    }

    // Send past 25 messages to newcomer
    if (state.messages && state.messages.length > 0) {
      socket.emit("chat-history-server", state.messages);
    }

    if (state?.currentVideo) {
      const wasPlaying = Boolean(state.isPlaying);
      // If video was playing, compute elapsed time and pause globally
      if (state.isPlaying) {
        const elapsed = state.lastPlayTimestamp
          ? (Date.now() - state.lastPlayTimestamp) / 1000
          : 0;
        state.currentTime = (state.currentTime ?? 0) + elapsed;
        state.isPlaying = false;
        state.lastPlayTimestamp = undefined;
      }

      // Only pause existing users if the video was actively playing
      if (wasPlaying && totalUsersInRoom > 1) {
        io.to(roomName).emit("video-paused-server", state.currentTime ?? 0);
        socket.to(roomName).emit(
          "user-connected",
          `A new user joined. Video paused at ${formatTime(state.currentTime ?? 0)} so everyone is in sync.`
        );
      } else {
        socket.to(roomName).emit("user-connected", "Guest has joined the room");
      }

      // Send the current video and paused timestamp to the newly joined client
      socket.emit("video-selected-server", state.currentVideo);
      if (typeof state.currentTime === "number" && state.currentTime > 0) {
        socket.emit("video-seeking-server", state.currentTime);
      }
      socket.emit("video-paused-server", state.currentTime ?? 0);
    } else {
      socket.to(roomName).emit("user-connected", "Guest has joined the room");
    }

    broadcastUserCount(io, socket.currentRoom);
    console.log("A user connected via real-time web socket!");
  });

  // React to ready click
  socket.on("user-ready-click", () => {
    socket.data.isReady = true;
    if (socket.currentRoom) {
      broadcastUserCount(io, socket.currentRoom);
    }
  });

  // Listen for when a user changes their video dropdown or loads a URL
  socket.on("video-selected-client", (videoName: string) => {
    if (!socket.currentRoom) return;
    if (typeof videoName !== "string") return;

    const cleanVideo = videoName.trim().slice(0, 1000);
    if (!cleanVideo) return;

    // Block dangerous URI schemes
    const lower = cleanVideo.toLowerCase();
    if (
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("vbscript:") ||
      lower.startsWith("blob:") ||
      lower.startsWith("file:")
    ) {
      console.warn(`Blocked dangerous video URI in room '${socket.currentRoom}'`);
      return;
    }

    const isServerRoom = socket.currentRoom.toLowerCase() === "server";
    const isWebUrl = cleanVideo.startsWith("http://") || cleanVideo.startsWith("https://");

    // Block non-server rooms from broadcasting local server video files
    if (!isServerRoom && !isWebUrl) {
      console.warn(`Blocked local video selection '${cleanVideo}' in non-server room '${socket.currentRoom}'`);
      return;
    }

    // In server room, if selecting a local video, ensure it does not contain path traversal characters
    if (isServerRoom && !isWebUrl) {
      if (cleanVideo.includes("..") || cleanVideo.includes("/") || cleanVideo.includes("\\")) {
        console.warn(`Blocked invalid filename '${cleanVideo}' in server room`);
        return;
      }
    }

    console.log(`Broadcasting new video selection: ${cleanVideo}`);
    let state = roomStates.get(socket.currentRoom);
    if (!state) {
      state = { messages: [] };
      roomStates.set(socket.currentRoom, state);
    }
    state.currentVideo = cleanVideo;
    state.currentTime = 0;
    state.isPlaying = false;
    state.lastPlayTimestamp = undefined;

    socket.to(socket.currentRoom).emit("video-selected-server", cleanVideo);
  });

  // Listen for user chat messages
  socket.on("chat-message-client", (data: ClientChatMessageData) => {
    if (!socket.currentRoom) return;
    if (!data || typeof data.text !== "string") return;

    // Sanitize message: trim, cap at 500 characters
    const cleanText = data.text.trim().slice(0, 500);
    if (!cleanText) return;

    // Sanitize sender: trim, cap at 30 characters, fallback to Guest
    const rawSender = typeof data.sender === "string" ? data.sender.trim() : "";
    const cleanSender = rawSender.slice(0, 30) || `Guest-${socket.id.substring(0, 4)}`;

    const now = new Date();
    const timeFormatted = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const chatMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sender: cleanSender,
      text: cleanText,
      timestamp: Date.now(),
      timeFormatted,
    };

    let state = roomStates.get(socket.currentRoom);
    if (!state) {
      state = { messages: [] };
      roomStates.set(socket.currentRoom, state);
    }

    if (!state.messages) {
      state.messages = [];
    }

    // Keep at most the past 25 messages
    state.messages.push(chatMessage);
    if (state.messages.length > 25) {
      state.messages.splice(0, state.messages.length - 25);
    }

    // Broadcast to everyone in the room (including sender)
    io.to(socket.currentRoom).emit("chat-message-server", chatMessage);
  });

  socket.on("video-seeking-client", (currentTime: number) => {
    if (typeof currentTime !== "number" || !isFinite(currentTime) || currentTime < 0) return;
    console.log(`Broadcasting new video seek time: ${currentTime}`);
    if (socket.currentRoom) {
      const state = roomStates.get(socket.currentRoom);
      if (state) {
        state.currentTime = currentTime;
        if (state.isPlaying) {
          state.lastPlayTimestamp = Date.now();
        }
      }
      socket.to(socket.currentRoom).emit("video-seeking-server", currentTime);
    }
  });

  socket.on("video-paused-client", (currentTime: number) => {
    if (typeof currentTime !== "number" || !isFinite(currentTime) || currentTime < 0) return;
    console.log(`Broadcasting new video pause time: ${currentTime}`);
    if (socket.currentRoom) {
      const state = roomStates.get(socket.currentRoom);
      if (state) {
        state.currentTime = currentTime;
        state.isPlaying = false;
        state.lastPlayTimestamp = undefined;
      }
      socket.to(socket.currentRoom).emit("video-paused-server", currentTime);
    }
  });

  socket.on("video-played-client", (currentTime: number) => {
    if (typeof currentTime !== "number" || !isFinite(currentTime) || currentTime < 0) return;
    console.log(`Broadcasting new video play time: ${currentTime}`);
    if (socket.currentRoom) {
      const state = roomStates.get(socket.currentRoom);
      if (state) {
        state.currentTime = currentTime;
        state.isPlaying = true;
        state.lastPlayTimestamp = Date.now();
      }
      socket.to(socket.currentRoom).emit("video-played-server", currentTime);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected.");
    if (socket.currentRoom) {
      const room = socket.currentRoom;
      io.to(room).emit("user-disconnected", "Guest has left the room.");
      broadcastUserCount(io, room);

      // Clean up room state if room is empty
      const roomSocketIds = io.sockets.adapter.rooms.get(room);
      if (!roomSocketIds || roomSocketIds.size === 0) {
        roomStates.delete(room);
      }
    }
  });
});

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(HTML_DIR, "home.html"));
});

app.get("/api/videos", async (req: Request, res: Response) => {
  const roomQuery = typeof req.query.room === "string" ? req.query.room.toLowerCase() : "";
  const referer = req.headers.referer || "";
  let refererRoom = "";
  try {
    if (referer) {
      refererRoom = new URL(referer, `http://${req.headers.host}`).pathname.substring(1).toLowerCase();
    }
  } catch {
    // Ignore URL parse error
  }

  const isServerRoom = roomQuery === "server" || refererRoom === "server";

  if (!isServerRoom) {
    return res.status(403).json({ error: "Access to server video list is restricted to the 'server' room." });
  }

  try {
    const videoList = await getVideoList();
    res.json(videoList);
  } catch (err) {
    console.error("Error reading video directory:", err);
    res.status(500).json({ error: "Failed to read video directory" });
  }
});

app.get("/:roomName", (_req: Request, res: Response) => {
  res.sendFile(path.join(HTML_DIR, "index.html"));
});

// Check and log available videos on server startup
getVideoList()
  .then((videoList) => {
    console.log(videoList);
  })
  .catch((err) => {
    console.error("Error reading video directory:", err);
  });

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}
