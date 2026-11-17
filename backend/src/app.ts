import express, { Request, Response } from "express";
import http from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import { HTML_DIR, VIDEO_DIR } from "./paths";
import {
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
app.use("/videos", express.static(VIDEO_DIR));

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
    socket.join(roomName);
    socket.currentRoom = roomName;
    socket.data.currentRoom = roomName;
    console.log(`User ${socket.id} joined room: ${roomName}`);

    // Broadcast to others in the room that someone joined
    socket.to(roomName).emit("user-connected", "Guest has joined the room");
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

  // Listen for when a user changes their video dropdown
  socket.on("video-selected-client", (videoName: string) => {
    console.log(`Broadcasting new video selection: ${videoName}`);
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit("video-selected-server", videoName);
    }
  });

  socket.on("video-seeking-client", (currentTime: number) => {
    console.log(`Broadcasting new video seek time: ${currentTime}`);
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit("video-seeking-server", currentTime);
    }
  });

  socket.on("video-paused-client", (currentTime: number) => {
    console.log(`Broadcasting new video pause time: ${currentTime}`);
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit("video-paused-server", currentTime);
    }
  });

  socket.on("video-played-client", (currentTime: number) => {
    console.log(`Broadcasting new video play time: ${currentTime}`);
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit("video-played-server", currentTime);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected.");
    if (socket.currentRoom) {
      io.to(socket.currentRoom).emit("user-disconnected", "Guest has left the room.");
      broadcastUserCount(io, socket.currentRoom);
    }
  });
});

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(HTML_DIR, "home.html"));
});

app.get("/api/videos", async (_req: Request, res: Response) => {
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
