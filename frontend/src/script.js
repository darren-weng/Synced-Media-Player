async function fetchVideos() {
  const dropdown = document.getElementById("videoList");
  if (!dropdown) return;

  try {
    const response = await fetch("/api/videos?room=server");
    if (!response.ok) {
      console.warn("Server video catalog is restricted to the 'server' room.");
      return;
    }
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
  messageElement.className = "chat-bubble chat-system-bubble";
  messageElement.textContent = message;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return messageElement;
}

// Render user chat messages securely without any script execution risk
function renderChatMessage(msg) {
  const chatMessages = document.querySelector(".chat-messages");
  if (!chatMessages || !msg) return;

  const emptyState = chatMessages.querySelector(".chat-empty-state");
  if (emptyState) {
    emptyState.style.display = "none";
  }

  const card = document.createElement("div");
  card.className = "chat-card";

  const currentUsername = sessionStorage.getItem("lounge_chat_username") || "";
  if (currentUsername && msg.sender.toLowerCase() === currentUsername.toLowerCase()) {
    card.classList.add("is-own-card");
  }

  const header = document.createElement("div");
  header.className = "chat-card-header";

  const senderSpan = document.createElement("span");
  senderSpan.className = "chat-card-sender";
  senderSpan.textContent = msg.sender || "Guest"; // Immune to XSS

  const timeSpan = document.createElement("span");
  timeSpan.className = "chat-card-time";
  timeSpan.textContent = msg.timeFormatted || "";

  header.appendChild(senderSpan);
  header.appendChild(timeSpan);

  const textBody = document.createElement("div");
  textBody.className = "chat-card-text";
  textBody.textContent = msg.text || ""; // Immune to XSS

  card.appendChild(header);
  card.appendChild(textBody);

  chatMessages.appendChild(card);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialize room display and title on load
document.addEventListener("DOMContentLoaded", () => {
  const roomPath = decodeURIComponent(window.location.pathname.substring(1));
  const isServerRoom = roomPath.toLowerCase() === "server";
  const roomNameDisplay = document.getElementById("roomNameDisplay");
  const serverControlsRow = document.getElementById("serverControlsRow");
  
  if (roomNameDisplay) {
    roomNameDisplay.textContent = roomPath ? `#${roomPath}` : "Room";
  }

  if (roomPath) {
    document.title = `${roomPath} — Synced Media Player`;
  }

  // Only show server video dropdown and fetch catalog if in the "server" room
  if (isServerRoom) {
    if (serverControlsRow) {
      serverControlsRow.style.display = "flex";
    }
    fetchVideos();
  } else {
    if (serverControlsRow) {
      serverControlsRow.style.display = "none";
    }
  }

  const readyBtn = document.getElementById("readyButton");
  if (readyBtn) {
    readyBtn.addEventListener("click", () => {
      readyBtn.textContent = "Ready ✓";
      readyBtn.classList.add("ready-confirmed");
    });
  }

  // Nickname & Live Chat setup
  const USERNAME_KEY = "lounge_chat_username";
  const currentUserNameDisplay = document.getElementById("currentUserNameDisplay");
  const changeNameBtn = document.getElementById("changeNameBtn");
  const nicknameModal = document.getElementById("nicknameModal");
  const nicknameForm = document.getElementById("nicknameForm");
  const nicknameInput = document.getElementById("nicknameInput");
  const cancelNicknameBtn = document.getElementById("cancelNicknameBtn");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");

  function getSavedName() {
    return sessionStorage.getItem(USERNAME_KEY) || "";
  }

  function updateNameBadge(name) {
    if (currentUserNameDisplay) {
      currentUserNameDisplay.textContent = name || "Set Name";
    }
  }

  updateNameBadge(getSavedName());

  function openNicknameModal(isEditing = false) {
    if (!nicknameModal) return;
    nicknameModal.style.display = "flex";
    if (nicknameInput) {
      nicknameInput.value = getSavedName();
      setTimeout(() => nicknameInput.focus(), 50);
    }
    if (cancelNicknameBtn) {
      cancelNicknameBtn.style.display = isEditing && getSavedName() ? "inline-flex" : "none";
    }
  }

  function closeNicknameModal() {
    if (nicknameModal) {
      nicknameModal.style.display = "none";
    }
  }

  if (changeNameBtn) {
    changeNameBtn.addEventListener("click", () => openNicknameModal(true));
  }

  if (cancelNicknameBtn) {
    cancelNicknameBtn.addEventListener("click", closeNicknameModal);
  }

  if (nicknameForm) {
    nicknameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const newName = (nicknameInput ? nicknameInput.value : "").trim().slice(0, 30);
      if (!newName) return;

      sessionStorage.setItem(USERNAME_KEY, newName);
      updateNameBadge(newName);
      closeNicknameModal();

      if (chatInput) {
        chatInput.focus();
      }
    });
  }

  // Intercept chat form submit
  if (chatForm && chatInput) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const messageText = chatInput.value.trim().slice(0, 500);
      if (!messageText) return;

      const user = getSavedName();
      if (!user) {
        openNicknameModal(false);
        return;
      }

      // Emit chat message through socket
      if (typeof socket !== "undefined" && socket && typeof socket.emit === "function") {
        socket.emit("chat-message-client", {
          sender: user,
          text: messageText,
        });
        chatInput.value = "";
      }
    });

    chatInput.addEventListener("focus", () => {
      if (!getSavedName()) {
        openNicknameModal(false);
      }
    });
  }
});
