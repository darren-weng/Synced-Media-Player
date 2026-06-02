const socket = io();

const dropdown = document.getElementById("videoList");
const player = document.getElementById("videoPlayer");
const videoSource = document.getElementById("videoSource");
const chatMessages = document.querySelector(".chat-messages");
const readyButton = document.getElementById("readyButton");

let isSyncing = false; // prevent feedback loops during seeking
let totalUsersReady = 0; 
let totalUsers = 0;

dropdown.addEventListener("change", (event) => {
  const selectedVideo = event.target.value;
  console.log("Locally selected video:", selectedVideo);

  // updates on the local side then sends it to server
  updateLocalVideo(selectedVideo);
  socket.emit("video-selected-client", selectedVideo);
});

// when the user skips forward in the video
player.addEventListener("seeking", (event) => {
  if (isSyncing) return; // let seeked make it false so theres no infinite loop

  const currentTime = player.currentTime;
  console.log("Locally seeking video to:", currentTime);

  socket.emit("video-seeking-client", currentTime);
});

// player naturally fires 'seeked' ONCE it finishes buffering the new time
player.addEventListener("seeked", () => {
  // Turn off the sync flag ONLY after the player completely settles down!
  if (isSyncing) {
    console.log("Server sync complete, releasing lock.");
    isSyncing = false;
  }
});

// when the user pauses the video
player.addEventListener("pause", (event) => {
  if (isSyncing) return;

  const currentTime = player.currentTime;
  console.log("Locally paused video at:", currentTime);

  socket.emit("video-paused-client", currentTime);
});

player.addEventListener("play", (event) => {
  if (isSyncing) return;

  const currentTime = player.currentTime;
  console.log("Locally played video at:", currentTime);

  socket.emit("video-played-client", currentTime);
});

// force changes from the other clients through the server
socket.on("video-selected-server", (videoName) => {
  console.log("Received video selection from server:", videoName);

  dropdown.value = videoName;
  updateLocalVideo(videoName);
});

// force changes from time skips
socket.on("video-seeking-server", (incomingTime) => {
  console.log(`Server ordered a timeline jump to: ${incomingTime}s`);

  isSyncing = true; // prevent feedback loop
  player.currentTime = incomingTime;
});

socket.on("video-paused-server", (incomingTime) => {
  console.log(`Server ordered a video pause at: ${incomingTime}s`);

  isSyncing = true;
  player.currentTime = incomingTime;
  player.pause();
});

socket.on("video-played-server", (incomingTime) => {
  console.log(`Server ordered a video play at: ${incomingTime}s`);

  isSyncing = true;
  player.currentTime = incomingTime;
  player.play();
});

// for user connection and leaving
socket.on('user-connected', (message) => {
  console.log(message);

  createChatElement(message);
});

socket.on('user-disconnected', (message) => {
  console.log(message);

  createChatElement(message);
});

// for message ab who's ready
readyButton.addEventListener("click", () => {
  socket.emit('user-ready-click');

  readyButton.disabled = true; // disable the button after clicking
});

socket.on('user-count', (data) => {
  createChatElement(`Users ready: ${data.ready}/${data.total}`);

  totalUsersReady = data.ready;
  totalUsers = data.total;
});