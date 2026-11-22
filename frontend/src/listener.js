const socket = io();

// DOM Elements
const dropdown = document.getElementById("videoList");
const player = document.getElementById("videoPlayer");
const videoSource = document.getElementById("videoSource");
const youtubeContainer = document.getElementById("youtubeContainer");
const readyButton = document.getElementById("readyButton");
const urlInput = document.getElementById("urlInput");
const loadUrlButton = document.getElementById("loadUrlButton");
const unmuteBanner = document.getElementById("unmuteBanner");
const mediaStatus = document.getElementById("mediaStatus");
const currentMediaInfo = document.getElementById("currentMediaInfo");
const currentMediaLink = document.getElementById("currentMediaLink");

// State
const roomName = window.location.pathname.substring(1);
if (roomName) socket.emit("join-room", roomName);

let ignoreNextEvent = false; // Prevent feedback loops during seeking/syncing
let ytPlayer = null;
let isYTReady = false;
let pendingYTVideoId = null;
let pendingSeekTime = 0;
let pendingShouldPlay = false;
let hasUserInteracted = false;

function userHasInteracted() {
  if (hasUserInteracted) return true;
  if (navigator.userActivation && navigator.userActivation.hasBeenActive) {
    return true;
  }
  return false;
}

function recordUserInteraction() {
  hasUserInteracted = true;
  unlockAudio();
}

document.addEventListener("click", recordUserInteraction, true);
document.addEventListener("keydown", recordUserInteraction, true);
document.addEventListener("touchstart", recordUserInteraction, true);
document.addEventListener("pointerdown", recordUserInteraction, true);

// Detect clicks inside YouTube iframe via window blur + activeElement
window.addEventListener("blur", () => {
  setTimeout(() => {
    if (document.activeElement && document.activeElement.tagName === "IFRAME") {
      recordUserInteraction();
    }
  }, 50);
});

// Status & Banner helpers using CSS classes
function showStatus(message, type = "info") {
  if (!mediaStatus) return;
  mediaStatus.textContent = message;
  mediaStatus.className = `media-status visible ${type}`;
}

function hideStatus() {
  if (mediaStatus) {
    mediaStatus.className = "media-status";
    mediaStatus.textContent = "";
  }
}

function showUnmuteBanner() {
  if (unmuteBanner) unmuteBanner.classList.add("visible");
}

function hideUnmuteBanner() {
  if (unmuteBanner) unmuteBanner.classList.remove("visible");
}

// Unified Media Player Controller
const activePlayer = {
  type: "html5", // "html5" or "youtube"
  isMutedDueToAutoplay: false,

  play() {
    if (this.type === "youtube") {
      if (ytPlayer && typeof ytPlayer.playVideo === "function") {
        if (this.isMutedDueToAutoplay && typeof ytPlayer.mute === "function") {
          ytPlayer.mute();
        }
        ytPlayer.playVideo();
      }
      return Promise.resolve();
    } else if (player) {
      if (this.isMutedDueToAutoplay) {
        player.muted = true;
      }
      return player.play();
    }
    return Promise.resolve();
  },

  pause() {
    pendingShouldPlay = false;
    if (this.type === "youtube") {
      if (ytPlayer && typeof ytPlayer.pauseVideo === "function") {
        ytPlayer.pauseVideo();
      }
    } else if (player) {
      player.pause();
    }
  },

  seek(seconds) {
    pendingSeekTime = seconds;
    if (this.type === "youtube") {
      if (ytPlayer && typeof ytPlayer.seekTo === "function" && typeof ytPlayer.getPlayerState === "function") {
        const state = ytPlayer.getPlayerState();
        // If YouTube is cued (5) or unstarted (-1), calling seekTo() can inadvertently trigger autoplay.
        if (state === 5 || state === -1) {
          if (seconds > 0.5) {
            const currentId = extractYouTubeId(urlInput ? urlInput.value : "");
            if (currentId && typeof ytPlayer.cueVideoById === "function") {
              ytPlayer.cueVideoById(currentId, seconds);
            }
          }
        } else {
          const curTime = activePlayer.getCurrentTime();
          if (Math.abs(curTime - seconds) > 0.3) {
            ytPlayer.seekTo(seconds, true);
          }
        }
      }
    } else if (player) {
      if (Math.abs(player.currentTime - seconds) > 0.3) {
        player.currentTime = seconds;
      }
    }
  },

  getCurrentTime() {
    if (this.type === "youtube") {
      if (ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
        return ytPlayer.getCurrentTime() || 0;
      }
      return 0;
    } else if (player) {
      return player.currentTime || 0;
    }
    return 0;
  },

  setMuted(muted) {
    this.isMutedDueToAutoplay = muted;
    if (this.type === "youtube") {
      if (ytPlayer) {
        if (muted && typeof ytPlayer.mute === "function") ytPlayer.mute();
        else if (!muted && typeof ytPlayer.unMute === "function") ytPlayer.unMute();
      }
    } else if (player) {
      player.muted = muted;
    }
  }
};

// Autoplay unlocker: Restores audio when user interacts
function unlockAudio() {
  if (activePlayer.isMutedDueToAutoplay) {
    activePlayer.setMuted(false);
    hideUnmuteBanner();
  }
}

// Safe play handler: ensures playback starts even if user has never clicked screen
function safePlay(incomingTime) {
  if (typeof incomingTime === "number") {
    activePlayer.seek(incomingTime);
  }

  // If YouTube is pending setup, queue play when onReady fires
  if (activePlayer.type === "youtube" && (!ytPlayer || typeof ytPlayer.playVideo !== "function")) {
    pendingShouldPlay = true;
    return;
  }

  // Modern browsers (Chrome, Safari, Firefox) prohibit unmuted playback without prior user activation.
  // Proactively start playing muted so the video starts in sync immediately without freezing!
  if (!userHasInteracted()) {
    console.warn("User has not interacted with screen yet. Playing muted to bypass browser policy.");
    activePlayer.setMuted(true);
    showUnmuteBanner();
    activePlayer.play();
    return;
  }

  // If user has interacted, attempt regular playback with sound
  const playPromise = activePlayer.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((err) => {
      console.warn("Autoplay blocked by browser policy:", err.message);
      activePlayer.setMuted(true);
      showUnmuteBanner();
      activePlayer.play();
    });
  }
}

function syncPlayer(action) {
  ignoreNextEvent = true;
  action();
  setTimeout(() => {
    ignoreNextEvent = false;
  }, 150);
}

// YouTube Player Lifecycle
window.onYouTubeIframeAPIReady = function() {
  isYTReady = true;
  if (pendingYTVideoId) {
    createOrLoadYouTubePlayer(pendingYTVideoId, pendingSeekTime);
    pendingYTVideoId = null;
    pendingSeekTime = 0;
  }
};

if (window.YT && window.YT.Player) {
  isYTReady = true;
}

function createOrLoadYouTubePlayer(videoId, startSeconds = 0) {
  if (!ytPlayer) {
    const container = document.getElementById("youtubePlayer");
    if (!container) return;

    ytPlayer = new YT.Player("youtubePlayer", {
      height: "100%",
      width: "100%",
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin,
        start: Math.floor(startSeconds)
      },
      events: {
        onReady: (event) => {
          if (startSeconds > 0) {
            event.target.seekTo(startSeconds, true);
          }
          if (pendingShouldPlay) {
            pendingShouldPlay = false;
            safePlay(startSeconds);
          } else {
            event.target.pauseVideo();
          }
        },
        onStateChange: onYouTubeStateChange,
        onError: onYouTubeError
      }
    });
  } else {
    if (typeof ytPlayer.cueVideoById === "function") {
      ytPlayer.cueVideoById(videoId, startSeconds || 0);
    } else {
      pendingYTVideoId = videoId;
      pendingSeekTime = startSeconds;
    }
  }
}

function onYouTubeStateChange(event) {
  if (ignoreNextEvent) return;

  // YT.PlayerState.PLAYING === 1
  if (event.data === 1) {
    const time = activePlayer.getCurrentTime();
    console.log("Locally played YouTube at:", time);
    socket.emit("video-played-client", time);
  }
  // YT.PlayerState.PAUSED === 2
  else if (event.data === 2) {
    const time = activePlayer.getCurrentTime();
    console.log("Locally paused YouTube at:", time);
    socket.emit("video-paused-client", time);
  }
}

function onYouTubeError(event) {
  let msg = "YouTube video could not be loaded.";
  if (event.data === 2) msg = "Invalid YouTube video link or ID.";
  else if (event.data === 100) msg = "YouTube video not found or removed.";
  else if (event.data === 101 || event.data === 150) {
    msg = "This YouTube video owner has disabled playback on external websites.";
  }
  showStatus(msg, "error");
}

// URL Parsing and Helpers
function extractYouTubeId(url) {
  const regExp = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

function normalizeDropboxUrl(url) {
  if (url.includes("dropbox.com")) {
    let clean = url.replace("?dl=0", "").replace("&dl=0", "");
    return clean + (clean.includes("?") ? "&raw=1" : "?raw=1");
  }
  return url;
}

function isValidHttpUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// Universal Media Loader: switches seamlessly between HTML5 and YouTube
function loadMedia(source, shouldBroadcast = false) {
  if (!source) return;
  hideStatus();

  // Pause any currently playing media before replacing
  activePlayer.pause();

  const ytId = extractYouTubeId(source);

  if (ytId) {
    // Mode: YouTube
    activePlayer.type = "youtube";
    if (player) {
      player.pause();
      player.style.display = "none";
    }
    if (youtubeContainer) youtubeContainer.style.display = "block";

    if (isYTReady) {
      createOrLoadYouTubePlayer(ytId, pendingSeekTime || 0);
      pendingSeekTime = 0;
    } else {
      pendingYTVideoId = ytId;
    }
  } else {
    // Mode: HTML5 Video (Direct URL, Dropbox, or Server Video)
    activePlayer.type = "html5";
    if (youtubeContainer) youtubeContainer.style.display = "none";
    if (ytPlayer && typeof ytPlayer.pauseVideo === "function") {
      ytPlayer.pauseVideo();
    }
    if (player) {
      player.style.display = "block";

      let targetSrc = source;
      if (source.startsWith("http://") || source.startsWith("https://")) {
        targetSrc = normalizeDropboxUrl(source);
      } else {
        // Server-hosted video from dropdown (restricted to server room)
        targetSrc = `/videos/${encodeURIComponent(source)}?room=server`;
      }

      videoSource.src = targetSrc;
      player.currentTime = pendingSeekTime || 0;
      player.pause();
      player.load();
      pendingSeekTime = 0;
    }
  }

  // Update UI with the active video source so everyone can see it
  if (urlInput) {
    urlInput.value = source;
  }
  if (currentMediaInfo && currentMediaLink) {
    currentMediaInfo.style.display = "block";
    currentMediaLink.textContent = source;
    const isSafeWebUrl = source.startsWith("http://") || source.startsWith("https://");
    currentMediaLink.href = isSafeWebUrl ? source : `/videos/${encodeURIComponent(source)}?room=server`;
  }

  if (shouldBroadcast) {
    socket.emit("video-selected-client", source);
    if (typeof createChatElement === "function") {
      createChatElement("Loaded video: " + source);
    }
  }
}

// Event Listeners for UI Controls
if (loadUrlButton && urlInput) {
  const handleUrlLoad = () => {
    const url = urlInput.value.trim();
    if (!url) {
      showStatus("Please enter a video URL.", "error");
      return;
    }

    if (!isValidHttpUrl(url) && !extractYouTubeId(url)) {
      showStatus("Invalid URL. Please enter a valid http/https or YouTube URL.", "error");
      return;
    }

    loadMedia(url, true);
  };

  loadUrlButton.addEventListener("click", handleUrlLoad);
  urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleUrlLoad();
  });
}

if (dropdown) {
  dropdown.addEventListener("change", (event) => {
    const selectedVideo = event.target.value;
    if (!selectedVideo) return;
    loadMedia(selectedVideo, true);
  });
}

if (readyButton) {
  readyButton.addEventListener("click", () => {
    recordUserInteraction();
    socket.emit("user-ready-click");
    readyButton.disabled = true;
  });
}

// HTML5 Player Native Event Listeners
player.addEventListener("seeking", () => {
  if (ignoreNextEvent || activePlayer.type !== "html5") return;
  const currentTime = player.currentTime;
  socket.emit("video-seeking-client", currentTime);
});

player.addEventListener("pause", () => {
  if (ignoreNextEvent || activePlayer.type !== "html5") return;
  const currentTime = player.currentTime;
  console.log("Locally paused video at:", currentTime);
  socket.emit("video-paused-client", currentTime);
});

player.addEventListener("play", () => {
  if (ignoreNextEvent || activePlayer.type !== "html5") return;
  const currentTime = player.currentTime;
  console.log("Locally played video at:", currentTime);
  socket.emit("video-played-client", currentTime);
});

player.addEventListener("error", () => {
  if (activePlayer.type === "html5" && videoSource.src) {
    showStatus("Could not load video data. Please verify the URL is accessible and directly streams a supported video.", "error");
  }
});

player.addEventListener("canplay", () => {
  hideStatus();
});

// Socket.io Room Sync Event Handlers
socket.on("video-selected-server", (source) => {
  console.log("Received video selection from server:", source);

  if (dropdown) dropdown.value = source;
  loadMedia(source, false);
  if (typeof createChatElement === "function") {
    createChatElement("Room video switched to: " + source);
  }
});

socket.on("video-seeking-server", (incomingTime) => {
  console.log(`Server ordered seek to: ${incomingTime}s`);
  pendingSeekTime = incomingTime;
  syncPlayer(() => {
    activePlayer.seek(incomingTime);
  });
});

socket.on("video-paused-server", (incomingTime) => {
  console.log(`Server ordered pause at: ${incomingTime}s`);
  pendingSeekTime = incomingTime;
  syncPlayer(() => {
    activePlayer.seek(incomingTime);
    activePlayer.pause();
  });
});

socket.on("video-played-server", (incomingTime) => {
  console.log(`Server ordered play at: ${incomingTime}s`);
  syncPlayer(() => {
    safePlay(incomingTime);
  });
});

socket.on("user-connected", (message) => {
  if (typeof createChatElement === "function") createChatElement(message);
});

socket.on("user-disconnected", (message) => {
  if (typeof createChatElement === "function") createChatElement(message);
});

socket.on("user-count", (data) => {
  if (typeof createChatElement === "function") {
    createChatElement(`Users ready: ${data.ready}/${data.total}`);
  }
});

// Real-time chat messages
socket.on("chat-message-server", (msg) => {
  if (typeof renderChatMessage === "function") {
    renderChatMessage(msg);
  }
});

// Past 25 chat messages on room join
socket.on("chat-history-server", (messages) => {
  if (Array.isArray(messages) && typeof renderChatMessage === "function") {
    messages.forEach((msg) => renderChatMessage(msg));
  }
});
