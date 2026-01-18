// 1. Import the WebSocket library to allow real-time, two-way communication.
import { WebSocketServer } from "ws";

// 2. Start the server on port 8080. It's now listening for "knocks" on the door.
const wss = new WebSocketServer({ port: 8080 });

// 3. A Map is like a dictionary.
// Key: 'sessionId' (the Room ID) | Value: [Array of users in that room]
const sessions = new Map();

// 4. This triggers whenever a NEW user connects to the server.
wss.on("connection", (ws) => {
  // 5. This triggers whenever a user sends a "message" (data packet) to the server.
  ws.on("message", (msg) => {
    // Convert the raw data (buffer) into a readable JavaScript Object.
    const data = JSON.parse(msg);

    // --- LOGIC FOR JOINING A ROOM ---
    if (data.type === "join") {
      // Save the room ID directly onto this specific user's connection object
      // so we remember which room they belong to later.
      ws.sessionId = data.sessionId;

      // If this room ID doesn't exist in our Map yet...
      if (!sessions.has(data.sessionId)) {
        // ...create the room with an empty list.
        sessions.set(data.sessionId, []);
      }

      // Add this user (ws) into the list of peers for this specific room.
      sessions.get(data.sessionId).push(ws);
    }

    // --- LOGIC FOR SENDING SIGNALS (The "Switchboard") ---
    if (data.type === "signal") {
      // Find all people in the same room as the person who just sent this message.
      const peers = sessions.get(ws.sessionId) || [];

      // Loop through every person in that room.
      peers.forEach((peer) => {
        // We only want to send the message to OTHER people, not back to the sender.
        // Also check if their connection is still open (readyState === 1).
        if (peer !== ws && peer.readyState === 1) {
          // Send the data (like a handshake offer) to the other person.
          peer.send(JSON.stringify(data.payload));
        }
      });
    }
  });

  // 6. This triggers when a user closes their browser or loses internet.
  ws.on("close", () => {
    // If they weren't in a room, we don't need to do anything.
    if (!ws.sessionId) return;

    // Get the list of people in their room.
    const peers = sessions.get(ws.sessionId) || [];

    // Update the room list by FILTERING OUT the user who just disconnected.
    // This prevents the server from trying to send messages to a "ghost" user.
    sessions.set(
      ws.sessionId,
      peers.filter((peer) => peer !== ws),
    );
  });
});

console.log("Server started on port 8080");
