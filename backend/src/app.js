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

app.use(express.static(htmlDir));
app.use("/videos", express.static(videoDir));

function broadcastUserCount(io) {
  const totalUsers = io.sockets.sockets.size;

  // Count how many of the currently connected sockets are ready
  let readyCount = 0;
  io.sockets.sockets.forEach((socket) => {
      if (socket.data.isReady) {
          readyCount++;
      }
  });

  io.emit('user-count', { ready: readyCount, total: totalUsers });
}

io.on('connection', (socket) => {
    socket.data.isReady = false; // Initialize the ready status for this socket

    console.log('A user connected via real-time web socket!');
    io.emit('user-connected', 'Guest has joined the room.');

    //? update users count
    broadcastUserCount(io);

    // react to ready click
    socket.on('user-ready-click', () => {
        socket.data.isReady = true; // Mark this socket as ready
        broadcastUserCount(io); // Update all clients with the new count
    });

    // 3. Listen for when a user changes their video dropdown
    socket.on('video-selected-client', (videoName) => {
        console.log(`Broadcasting new video selection: ${videoName}`);
        
        // 4. Send this filename to EVERY OTHER connected browser tab
        socket.broadcast.emit('video-selected-server', videoName);
    });

    socket.on('video-seeking-client', (currentTime) => {
        console.log(`Broadcasting new video seek time: ${currentTime}`);
        
        socket.broadcast.emit('video-seeking-server', currentTime);
    });

    socket.on('video-paused-client', (currentTime) => {
        console.log(`Broadcasting new video pause time: ${currentTime}`);
        
        socket.broadcast.emit('video-paused-server', currentTime);
    });

    socket.on('video-played-client', (currentTime) => {
        console.log(`Broadcasting new video play time: ${currentTime}`);
        
        socket.broadcast.emit('video-played-server', currentTime);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected.');

        io.emit('user-disconnected', 'Guest has left the room.');
    });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(htmlDir, "index.html"));
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
