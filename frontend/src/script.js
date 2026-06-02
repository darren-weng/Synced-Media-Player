async function fetchVideos() {
  const dropdown = document.getElementById("videoList");

  const request = new Request("/api/videos", {
    method: "GET",
  });

  const response = await fetch(request);
  const videoList = await response.json()

  dropdown.innerHTML = ""; // Clear existing options
  
  for (let i = 0; i < videoList.length; i++) {
    const option = document.createElement("option");
    option.value = videoList[i];
    option.textContent = videoList[i];
    dropdown.appendChild(option);
  }
}

//! required to fetch the video list on page load to populate the dropdown
fetchVideos().then(response => console.log(response));


function updateLocalVideo(videoName) {
  if (!videoName) return;
  videoSource.src = `/videos/${videoName}`;
  player.load();
}


function createChatElement(message) {
  const messageElement = document.createElement("div");
  messageElement.textContent = message;

  if (!chatMessages) {
    console.error("Could not find the .chat-messages container!");
    return;
  }

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return messageElement;
}



