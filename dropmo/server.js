import { Server } from "socket.io";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow connections from any origin
  },
});

const PORT = 3000;

// --- Static File Serving ---
// Serve the built Vue.js application from the 'dist' directory
app.use(express.static(path.join(__dirname, "dist")));

// --- Signaling Logic ---
const activePeers = {}; // Maps peerId to socketId

function broadcastActivePeers() {
  const peerIds = Object.keys(activePeers);
  io.emit("active-peers-update", peerIds);
  console.log("Broadcasting active peers:", peerIds);
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Event: A new user registers their PeerJS ID
  socket.on("register-peer", (peerId) => {
    console.log(`Registering peer_id ${peerId} for socket ${socket.id}`);
    activePeers[peerId] = socket.id;
    socket.peerId = peerId; // Store peerId on socket for easy lookup on disconnect
    broadcastActivePeers();
  });

  // Event: User requests the current list of active peers
  socket.on("get-active-peers", () => {
    const peerIds = Object.keys(activePeers);
    socket.emit("active-peers-update", peerIds);
    console.log(`Sending active peers to ${socket.id}:`, peerIds);
  });

  // Event: User disconnects
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    if (socket.peerId && activePeers[socket.peerId]) {
      delete activePeers[socket.peerId];
      console.log(`Deregistered peer_id ${socket.peerId}`);
      broadcastActivePeers();
    }
  });
});

// --- Server Activation ---
httpServer.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
  console.log(`Access your app at http://localhost:${PORT}`);
});

