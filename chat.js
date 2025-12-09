// DOM Elements
const usernameModal = document.getElementById('usernameModal');
const usernameForm = document.getElementById('usernameForm');
const usernameInput = document.getElementById('username');
const createRoomModal = document.getElementById('createRoomModal');
const createRoomBtn = document.getElementById('createRoomBtn');
const closeModalBtn = document.getElementById('closeModal');
const cancelCreateRoomBtn = document.getElementById('cancelCreateRoom');
const createRoomForm = document.getElementById('createRoomForm');
const roomNameInput = document.getElementById('roomName');
const roomDescriptionInput = document.getElementById('roomDescription');
const roomTypeSelect = document.getElementById('roomType');
const roomsList = document.getElementById('roomsList');
const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const currentRoomElement = document.getElementById('currentRoom');
const roomMembersElement = document.getElementById('roomMembers');
const typingIndicator = document.getElementById('typingIndicator');
const typingUsersElement = document.getElementById('typingUsers');
const onlineUsersContainer = document.getElementById('onlineUsers');
const refreshRoomsBtn = document.getElementById('refreshRooms');
const roomSearchInput = document.getElementById('roomSearch');
const userMenuBtn = document.getElementById('userMenuBtn');
const userMenu = document.getElementById('userMenu');

// App state
let socket;
let currentUser = {
    id: '',
    username: '',
    avatar: ''
};
let currentRoom = null;
let rooms = [];
let onlineUsers = [];
let typingUsers = [];
let typingTimeout;

// Initialize the app
function init() {
    // Load user from localStorage if exists
    const savedUser = localStorage.getItem('chatUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        connectToServer();
    } else {
        showUsernameModal();
    }

    // Event listeners
    usernameForm.addEventListener('submit', handleUsernameSubmit);
    createRoomBtn.addEventListener('click', showCreateRoomModal);
    closeModalBtn.addEventListener('click', hideCreateRoomModal);
    cancelCreateRoomBtn.addEventListener('click', hideCreateRoomModal);
    createRoomForm.addEventListener('submit', handleCreateRoom);
    messageForm.addEventListener('submit', handleSendMessage);
    messageInput.addEventListener('input', handleTyping);
    refreshRoomsBtn.addEventListener('click', fetchRooms);
    roomSearchInput.addEventListener('input', filterRooms);
    userMenuBtn.addEventListener('click', toggleUserMenu);
    document.addEventListener('click', closeUserMenuOnOutsideClick);
}

// Connect to Socket.IO server
function connectToServer() {
    // Connect to the server
    socket = io();

    // Set up event listeners
    socket.on('connect', () => {
        console.log('Connected to server');
        // Send user info to server
        socket.emit('user:join', currentUser);
        // Fetch rooms
        fetchRooms();
    });

    socket.on('room:created', (room) => {
        addRoomToList(room);
    });

    socket.on('room:joined', (data) => {
        currentRoom = data.room;
        updateRoomUI(data.room);
        updateMessages(data.messages);
    });

    socket.on('message:new', (message) => {
        if (currentRoom && message.roomId === currentRoom.id) {
            appendMessage(message);
            scrollToBottom();
        }
    });

    socket.on('user:typing', (data) => {
        if (currentRoom && data.roomId === currentRoom.id) {
            updateTypingIndicator(data);
        }
    });

    socket.on('user:joined', (data) => {
        if (currentRoom && data.roomId === currentRoom.id) {
            addSystemMessage(`${data.username} joined the room`);
            updateRoomMembers();
        }
    });

    socket.on('user:left', (data) => {
        if (currentRoom && data.roomId === currentRoom.id) {
            addSystemMessage(`${data.username} left the room`);
            updateRoomMembers();
        }
    });

    socket.on('users:online', (users) => {
        updateOnlineUsers(users);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        alert(`Error: ${error.message}`);
    });
}

// Username form submission
function handleUsernameSubmit(e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    
    if (username) {
        currentUser = {
            id: generateUserId(),
            username: username,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
        };
        
        // Save user to localStorage
        localStorage.setItem('chatUser', JSON.stringify(currentUser));
        
        // Hide modal and connect to server
        hideUsernameModal();
        connectToServer();
    }
}

// Generate a simple user ID
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

// Fetch rooms from server
function fetchRooms() {
    fetch('/api/rooms')
        .then(response => response.json())
        .then(data => {
            rooms = data;
            renderRooms();
        })
        .catch(error => console.error('Error fetching rooms:', error));
}

// Render rooms list
function renderRooms() {
    if (rooms.length === 0) {
        roomsList.innerHTML = '<div class="text-center text-gray-500 py-4">No rooms available. Create one!</div>';
        return;
    }

    roomsList.innerHTML = rooms.map(room => `
        <div class="room-item p-3 rounded-lg hover:bg-gray-50 cursor-pointer border-b border-gray-100" data-room-id="${room.id}">
            <div class="flex justify-between items-center">
                <div>
                    <h3 class="font-medium">${room.name}</h3>
                    <p class="text-sm text-gray-500 truncate">${room.description || 'No description'}</p>
                </div>
                <span class="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full">${room.userCount || 0}</span>
            </div>
        </div>
    `).join('');

    // Add click event to room items
    document.querySelectorAll('.room-item').forEach(item => {
        item.addEventListener('click', () => {
            const roomId = item.dataset.roomId;
            joinRoom(roomId);
        });
    });
}

// Filter rooms based on search input
function filterRooms() {
    const searchTerm = roomSearchInput.value.toLowerCase();
    const filteredRooms = rooms.filter(room => 
        room.name.toLowerCase().includes(searchTerm) || 
        (room.description && room.description.toLowerCase().includes(searchTerm))
    );
    
    // Update the UI with filtered rooms
    roomsList.innerHTML = filteredRooms.map(room => `
        <div class="room-item p-3 rounded-lg hover:bg-gray-50 cursor-pointer border-b border-gray-100" data-room-id="${room.id}">
            <div class="flex justify-between items-center">
                <div>
                    <h3 class="font-medium">${room.name}</h3>
                    <p class="text-sm text-gray-500 truncate">${room.description || 'No description'}</p>
                </div>
                <span class="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full">${room.userCount || 0}</span>
            </div>
        </div>
    `).join('');

    // Reattach event listeners
    document.querySelectorAll('.room-item').forEach(item => {
        item.addEventListener('click', () => {
            const roomId = item.dataset.roomId;
            joinRoom(roomId);
        });
    });
}

// Join a room
function joinRoom(roomId) {
    if (!currentUser || !roomId) return;
    
    socket.emit('room:join', {
        roomId,
        user: currentUser
    });
}

// Handle sending a message
function handleSendMessage(e) {
    e.preventDefault();
    const message = messageInput.value.trim();
    
    if (message && currentRoom) {
        const messageData = {
            roomId: currentRoom.id,
            userId: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
            text: message,
            timestamp: new Date().toISOString()
        };
        
        socket.emit('message:send', messageData);
        messageInput.value = '';
        
        // Clear typing indicator
        clearTimeout(typingTimeout);
        socket.emit('user:typing', {
            roomId: currentRoom.id,
            userId: currentUser.id,
            isTyping: false
        });
    }
}

// Handle typing indicator
function handleTyping() {
    if (!currentRoom) return;
    
    // Clear any existing timeout
    clearTimeout(typingTimeout);
    
    // Notify server that user is typing
    socket.emit('user:typing', {
        roomId: currentRoom.id,
        userId: currentUser.id,
        username: currentUser.username,
        isTyping: true
    });
    
    // Set a timeout to stop showing typing after a delay
    typingTimeout = setTimeout(() => {
        socket.emit('user:typing', {
            roomId: currentRoom.id,
            userId: currentUser.id,
            isTyping: false
        });
    }, 2000);
}

// Update typing indicator UI
function updateTypingIndicator(data) {
    if (!data.isTyping) {
        const index = typingUsers.findIndex(u => u.userId === data.userId);
        if (index !== -1) {
            typingUsers.splice(index, 1);
        }
    } else if (!typingUsers.some(u => u.userId === data.userId)) {
        typingUsers.push(data);
    }
    
    if (typingUsers.length > 0) {
        typingUsersElement.textContent = typingUsers.map(u => u.username).join(', ');
        typingIndicator.classList.remove('hidden');
    } else {
        typingIndicator.classList.add('hidden');
    }
}

// Update messages in the UI
function updateMessages(messages) {
    messagesContainer.innerHTML = '';
    messages.forEach(message => {
        appendMessage(message);
    });
    scrollToBottom();
}

// Append a single message to the UI
function appendMessage(message) {
    const isCurrentUser = message.userId === currentUser.id;
    const messageElement = document.createElement('div');
    messageElement.className = `flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`;
    
    messageElement.innerHTML = `
        <div class="flex max-w-xs lg:max-w-md">
            ${!isCurrentUser ? `
                <img src="${message.avatar}" alt="${message.username}" class="w-8 h-8 rounded-full mr-2">
            ` : ''}
            <div class="flex-1">
                <div class="flex items-center ${isCurrentUser ? 'justify-end' : ''} mb-1">
                    <span class="text-xs text-gray-500">${formatTime(message.timestamp)}</span>
                </div>
                <div class="${isCurrentUser ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'} rounded-lg py-2 px-4 inline-block">
                    ${escapeHtml(message.text)}
                </div>
            </div>
            ${isCurrentUser ? `
                <img src="${message.avatar}" alt="${message.username}" class="w-8 h-8 rounded-full ml-2">
            ` : ''}
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
}

// Add a system message to the chat
function addSystemMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.className = 'text-center text-gray-500 text-sm my-2';
    messageElement.textContent = text;
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

// Update room UI when joined
function updateRoomUI(room) {
    currentRoom = room;
    currentRoomElement.textContent = room.name;
    messageInput.disabled = false;
    messageForm.querySelector('button').disabled = false;
    updateRoomMembers();
}

// Update room members list
function updateRoomMembers() {
    if (!currentRoom) return;
    
    const members = currentRoom.members || [];
    roomMembersElement.textContent = `${members.length} member${members.length !== 1 ? 's' : ''} online`;
}

// Update online users list
function updateOnlineUsers(users) {
    onlineUsers = users;
    
    if (users.length === 0) {
        onlineUsersContainer.innerHTML = '<p class="text-gray-500 text-sm">No users online</p>';
        return;
    }
    
    onlineUsersContainer.innerHTML = users.map(user => `
        <div class="flex items-center p-2 rounded-lg hover:bg-gray-50">
            <div class="relative">
                <img src="${user.avatar}" alt="${user.username}" class="w-10 h-10 rounded-full">
                <span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
            </div>
            <div class="ml-3">
                <p class="text-sm font-medium">${user.username}</p>
                <p class="text-xs text-gray-500">${user.status || 'Online'}</p>
            </div>
        </div>
    `).join('');
}

// Scroll to bottom of messages
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Show username modal
function showUsernameModal() {
    usernameModal.classList.remove('hidden');
}

// Hide username modal
function hideUsernameModal() {
    usernameModal.classList.add('hidden');
}

// Show create room modal
function showCreateRoomModal() {
    createRoomModal.classList.remove('hidden');
}

// Hide create room modal
function hideCreateRoomModal() {
    createRoomModal.classList.add('hidden');
    createRoomForm.reset();
}

// Handle create room form submission
function handleCreateRoom(e) {
    e.preventDefault();
    
    const roomData = {
        name: roomNameInput.value.trim(),
        description: roomDescriptionInput.value.trim(),
        type: roomTypeSelect.value,
        createdBy: currentUser.id
    };
    
    if (roomData.name) {
        socket.emit('room:create', roomData);
        hideCreateRoomModal();
    }
}

// Add a new room to the rooms list
function addRoomToList(room) {
    rooms.unshift(room);
    renderRooms();
}

// Toggle user menu
function toggleUserMenu() {
    userMenu.classList.toggle('hidden');
}

// Close user menu when clicking outside
function closeUserMenuOnOutsideClick(e) {
    if (!userMenuBtn.contains(e.target) && !userMenu.contains(e.target)) {
        userMenu.classList.add('hidden');
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
