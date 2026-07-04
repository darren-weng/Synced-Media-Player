const vidSelect = require("./vidSelect");

const express = require("express");
const path = require("path");
const app = express();
const port = 3000;

const { createServer } = require('node:http');
const { Server } = require("socket.io");
const server = createServer(app);
const io = new Server(server);

const htmlDir = path.join(__dirname, "../../frontend/src");
const videoDir = path.join(__dirname, "videos");

app.use(express.static(htmlDir, {index: false}));
app.use("/videos", express.static(videoDir));

function broadcastUserCount(io, roomName) {
  const roomSocketIds = io.sockets.adapter.rooms.get(roomName);  
  const totalUsers = roomSocketIds?.size || 0;

  // Count how many of the currently connected sockets are ready
  let readyCount = 0;

  if (roomSocketIds) {
    roomSocketIds.forEach((socketId) => {
        const socket = io.sockets.sockets.get(socketId);

        if (socket.data.isReady) {
            readyCount++;
        }
    });
  }

  io.to(roomName).emit('user-count', { ready: readyCount, total: totalUsers });
}

io.on('connection', (socket) => {
    // client tells the server which room they belong to
    socket.on('join-room', (roomName) => {
      socket.join(roomName); // Places the socket into a specific Socket.io room
      socket.currentRoom = roomName; // Custom property to keep track of it
      console.log(`User ${socket.id} joined room: ${roomName}`);
      
      // Optional: Broadcast to others in the room that someone joined
      socket.to(roomName).emit('user-connected', 'Guest has joined the room');
      broadcastUserCount(io, socket.currentRoom);

      console.log('A user connected via real-time web socket!');
    });

    // Initialize the ready status for this socket
    socket.data.isReady = false; 

    // react to ready click
    socket.on('user-ready-click', () => {
        socket.data.isReady = true; // Mark this socket as ready
        broadcastUserCount(io, socket.currentRoom); // Update all clients with the new count
    });

    // 3. Listen for when a user changes their video dropdown
    socket.on('video-selected-client', (videoName) => {
        console.log(`Broadcasting new video selection: ${videoName}`);
      
        // 4. Send this filename to EVERY OTHER connected browser tab
        socket.to(socket.currentRoom).emit('video-selected-server', videoName);
    });

    socket.on('video-seeking-client', (currentTime) => {
        console.log(`Broadcasting new video seek time: ${currentTime}`);
        
        socket.to(socket.currentRoom).emit('video-seeking-server', currentTime);
    });

    socket.on('video-paused-client', (currentTime) => {
        console.log(`Broadcasting new video pause time: ${currentTime}`);
        
        socket.to(socket.currentRoom).emit('video-paused-server', currentTime);
    });

    socket.on('video-played-client', (currentTime) => {
        console.log(`Broadcasting new video play time: ${currentTime}`);
        
        socket.to(socket.currentRoom).emit('video-played-server', currentTime);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected.');
        io.to(socket.currentRoom).emit('user-disconnected', 'Guest has left the room.');

        broadcastUserCount(io, socket.currentRoom);
    });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(htmlDir, "home.html"));
});

app.get("/api/videos", async (req, res) => {
  try {
    const videoList = await vidSelect.getVideoList();
    res.json(videoList);
  } catch (err) {
    console.error("Error reading video directory:", err);
    res.status(500).json({ error: "Failed to read video directory" });
  }
});

app.get('/:roomName', (req, res) => {
    res.sendFile(path.join(htmlDir, 'index.html'));
});

vidSelect
  .getVideoList()
  .then((videoList) => {
    console.log(videoList);
  })
  .catch((err) => {
    console.error("Error reading video directory:", err);
  });

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
