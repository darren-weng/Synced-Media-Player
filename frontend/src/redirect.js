const roomInput = document.getElementById('room-input');
const joinButton = document.getElementById('join-button');

function navigateToRoom() {
    const roomName = roomInput.value.trim();
    
    if (roomName !== '') {
        // Redirect the browser to example.com/your-room-name
        window.location.href = `/${roomName}`;
    } else {
        alert('Please enter a room name!');
    }
}

// Trigger on button click
joinButton.addEventListener('click', navigateToRoom);

// Trigger when pressing "Enter" inside the input box
roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        navigateToRoom();
    }
});

// prevents the user from typing spaces
roomInput.addEventListener('input', () => {
    roomInput.value = roomInput.value.replace(/\s/g, '');
});