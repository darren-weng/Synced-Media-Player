const roomInput = document.getElementById('room-input');
const joinButton = document.getElementById('join-button');
const roomError = document.getElementById('room-error');

function showError(msg) {
  if (roomError) {
    roomError.textContent = msg;
    roomError.classList.add('visible');
  }
  if (roomInput) {
    roomInput.classList.add('input-error');
    roomInput.focus();
  }
}

function hideError() {
  if (roomError) {
    roomError.textContent = '';
    roomError.classList.remove('visible');
  }
  if (roomInput) {
    roomInput.classList.remove('input-error');
  }
}

function navigateToRoom() {
  if (!roomInput) return;
  const roomName = roomInput.value.trim();
  
  if (roomName !== '') {
    hideError();
    // Redirect the browser to the room path
    window.location.href = `/${encodeURIComponent(roomName)}`;
  } else {
    showError('Please enter a room name to join or create a space.');
  }
}

// Trigger on button click
if (joinButton) {
  joinButton.addEventListener('click', navigateToRoom);
}

// Trigger when pressing "Enter" inside the input box
if (roomInput) {
  roomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      navigateToRoom();
    }
  });

  // Prevents the user from typing spaces and resets error state on input
  roomInput.addEventListener('input', () => {
    roomInput.value = roomInput.value.replace(/\s/g, '');
    hideError();
  });
}

// Quick space suggestion chips
document.querySelectorAll('.room-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const room = chip.getAttribute('data-room') || chip.textContent.replace('#', '').trim();
    if (roomInput) {
      roomInput.value = room;
      navigateToRoom();
    }
  });
});
