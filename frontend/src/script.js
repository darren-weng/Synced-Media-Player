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

fetchVideos().then(response => console.log(response));

