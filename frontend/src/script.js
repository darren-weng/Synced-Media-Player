async function fetchVideos() {
  const dropdown = document.getElementById("videoList");
  if (!dropdown) return;

  try {
    const response = await fetch("/api/videos");
    const videoList = await response.json();

    dropdown.innerHTML = '<option value="">Select server video...</option>';

    for (let i = 0; i < videoList.length; i++) {
      const option = document.createElement("option");
      option.value = videoList[i];
      option.textContent = videoList[i];
      dropdown.appendChild(option);
    }
  } catch (err) {
    console.error("Failed to fetch server videos:", err);
  }
}

fetchVideos();

function createChatElement(message) {
  const chatMessages = document.querySelector(".chat-messages");
  if (!chatMessages) {
    console.error("Could not find the .chat-messages container!");
    return;
  }

  // Hide the initial empty state once real messages begin arriving
  const emptyState = chatMessages.querySelector(".chat-empty-state");
  if (emptyState) {
    emptyState.style.display = "none";
  }

  const messageElement = document.createElement("div");
  messageElement.className = "chat-bubble";
  messageElement.textContent = message;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return messageElement;
}

// Initialize room display and title on load
document.addEventListener("DOMContentLoaded", () => {
  const roomPath = decodeURIComponent(window.location.pathname.substring(1));
  const roomNameDisplay = document.getElementById("roomNameDisplay");
  
  if (roomNameDisplay) {
    roomNameDisplay.textContent = roomPath ? `#${roomPath}` : "Room";
  }

  if (roomPath) {
    document.title = `${roomPath} — Synced Media Player`;
  }

  const readyBtn = document.getElementById("readyButton");
  if (readyBtn) {
    readyBtn.addEventListener("click", () => {
      readyBtn.textContent = "Ready ✓";
    });
  }
});
