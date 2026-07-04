const socket = io();

const dropdown = document.getElementById("videoList");
const player = document.getElementById("videoPlayer");
const videoSource = document.getElementById("videoSource");
const chatMessages = document.querySelector(".chat-messages");
const readyButton = document.getElementById("readyButton");

const roomName = window.location.pathname.substring(1);
if (roomName) socket.emit('join-room', roomName);

let ignoreNextEvent = false; // prevent feedback loops during seeking
let totalUsersReady = 0; 
let totalUsers = 0;

function syncPlayer(action) {
  ignoreNextEvent = true;

  // runs the function from the sockets
  action(); 
  setTimeout(() => {
    ignoreNextEvent = false;
  }, 50);
}

//** EVENT LISTENERS **//
dropdown.addEventListener("change", (event) => {
  const selectedVideo = event.target.value;
  console.log("Locally selected video:", selectedVideo);

  // updates on the local side then sends it to server
  updateLocalVideo(selectedVideo);
  socket.emit("video-selected-client", selectedVideo);
});

// for message ab who's ready
readyButton.addEventListener("click", () => {
  socket.emit('user-ready-click');

  readyButton.disabled = true; // disable the button after clicking
});


//* PLAYER EVENT LISTENERS *//
player.addEventListener("seeking", (event) => {
  if (ignoreNextEvent) return; // let seeked make it false so theres no infinite loop

  const currentTime = player.currentTime;
  socket.emit("video-seeking-client", currentTime);
});

// when the user pauses the video
player.addEventListener("pause", (event) => {
  if (ignoreNextEvent) return;

  const currentTime = player.currentTime;
  console.log("Locally paused video at:", currentTime);

  socket.emit("video-paused-client", player.currentTime);
});

player.addEventListener("play", (event) => {
  if (ignoreNextEvent) return;

  const currentTime = player.currentTime;
  console.log("Locally played video at:", currentTime);

  socket.emit("video-played-client", currentTime);
});


//** SOCKETS **//
// force changes from the other clients through the server
socket.on("video-selected-server", (videoName) => {
  console.log("Received video selection from server:", videoName);

  dropdown.value = videoName;
  updateLocalVideo(videoName);
});

// force changes from time skips
socket.on("video-seeking-server", (incomingTime) => {
  console.log(`Server ordered a timeline jump to: ${incomingTime}s`);

  syncPlayer(() => {
    player.currentTime = incomingTime;
  });
});

socket.on("video-paused-server", (incomingTime) => {
  console.log(`Server ordered a video pause at: ${incomingTime}s`);

  syncPlayer(() => {
    player.currentTime = incomingTime;
    player.pause();
  });
});

socket.on("video-played-server", (incomingTime) => {
  console.log(`Server ordered a video play at: ${incomingTime}s`);
  
  syncPlayer(() => {
    player.currentTime = incomingTime;
    player.play();
  });
});


//* SOCKETS FOR CHAT AND USER CONNECTIONS *//
socket.on('user-connected', (message) => {
  console.log(message);

  createChatElement(message);
});

socket.on('user-disconnected', (message) => {
  console.log(message);

  createChatElement(message);
});

socket.on('user-count', (data) => {
  createChatElement(`Users ready: ${data.ready}/${data.total}`);

  totalUsersReady = data.ready;
  totalUsers = data.total;
});