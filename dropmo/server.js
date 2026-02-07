// server.js
import { Server } from "socket.io";

// We'll use a simple object to store users and their PeerJS IDs
const users = {};

// Create a new Socket.IO server running on port 3000
const io = new Server(3000, {
  cors: {
    origin: "*", // Allow connections from any origin (for development)
  },
});

console.log("Signaling server running on port 3000");

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Event: A new user registers their PeerJS ID
  socket.on("register-peer", (peerId) => {
    console.log(`Registering peer_id ${peerId} for user ${socket.id}`);
    users[socket.id] = peerId;
    
    // Optional: You could broadcast the updated user list to all clients here
  });

  // Event: User disconnects
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    delete users[socket.id];
  });
});
