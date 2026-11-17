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

  const messageElement = document.createElement("div");
  messageElement.textContent = message;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return messageElement;
}
