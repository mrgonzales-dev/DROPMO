# P2P File Transfer Walkthrough with Vue, PeerJS, and Socket.IO

This guide will walk you through creating a simple web application that allows two users to send files directly to each other using PeerJS for the P2P connection and Socket.IO for signaling.

## 1. Project Goal

We will build a single-page application where:
*   Each user is assigned a unique ID upon visiting the page.
*   A user can see their own ID.
*   A user can enter another user's ID, select a file, and send it.
*   The receiving user gets a notification and a download link for the file.

---

## 2. Server-Side: The Signaling Server

PeerJS needs a "signaling" server to help peers find each other. Socket.IO is perfect for this. We'll create a minimal server that keeps track of which users are online.

**This server does NOT handle the file transfer.** It only introduces Peer A to Peer B.

**Step 2.1: Create `server.js`**

In the root of your project, create a new file called `server.js`.

```javascript
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
```

**Step 2.2: Add Server Dependencies**

You'll need `socket.io`. You already installed this, but if you were starting fresh, you'd run:
```bash
npm install socket.io
```

**Step 2.3: Run the Signaling Server**

You will need to run this script in a separate terminal from your Vue development server.
```bash
node server.js
```
Now you have a signaling server ready and waiting for clients to connect.

---

## 3. Client-Side: The Vue.js App

Now we will modify your Vue application to handle the user interface and the file transfer logic.

**Step 3.1: Install Dependencies (if you haven't)**

Ensure `peerjs` and `socket.io-client` are in your `package.json`.
```bash
npm install peerjs socket.io-client
```

**Step 3.2: Modify `App.vue`**

Replace the content of `src/App.vue` with the following. This component contains all the logic for our simple app.

```vue
<script setup>
import { ref, onMounted } from 'vue';
import { Peer } from 'peerjs';
import { io } from 'socket.io-client';

// --- Reactive State ---
const myPeerId = ref('');
const recipientPeerId = ref('');
const fileToSend = ref(null);
const receivedFile = ref(null);
const statusMessage = ref('Initializing...');
const receivedFileData = ref({
  blob: null,
  name: 'file',
  type: 'application/octet-stream'
});

let peer = null;
let socket = null;

// --- Lifecycle Hook ---
onMounted(() => {
  // 1. Connect to our signaling server
  socket = io('http://localhost:3000');

  socket.on('connect', () => {
    statusMessage.value = 'Connected to signaling server.';
    
    // 2. Initialize PeerJS
    // Pass an empty string to let the PeerServer generate an ID for us.
    peer = new Peer('', {
      host: 'localhost', // Use the default PeerJS server for simplicity
      port: 9000,
      path: '/myapp'
    });

    // 3. On successful connection to PeerServer
    peer.on('open', (id) => {
      myPeerId.value = id;
      statusMessage.value = `Your Peer ID is: ${id}`;
      // Register our new PeerJS ID with the signaling server
      socket.emit('register-peer', id);
    });

    // 4. Listen for incoming data connections
    peer.on('connection', (conn) => {
      statusMessage.value = `Incoming connection from ${conn.peer}`;
      
      const fileChunks = [];
      let fileMetadata = {};

      conn.on('data', (data) => {
        // The first piece of data should be metadata
        if (data.type === 'metadata') {
          fileMetadata = { name: data.name, type: data.type, size: data.size };
          statusMessage.value = `Receiving file: ${fileMetadata.name} (${fileMetadata.size} bytes)`;
        } else {
          // Subsequent data are file chunks
          fileChunks.push(data);
          const receivedSize = fileChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
          statusMessage.value = `Receiving file: ${fileMetadata.name}... ${Math.round((receivedSize / fileMetadata.size) * 100)}%`;

          // When all chunks are received
          if (receivedSize === fileMetadata.size) {
            const fileBlob = new Blob(fileChunks, { type: fileMetadata.type });
            receivedFileData.value = {
              blob: URL.createObjectURL(fileBlob),
              name: fileMetadata.name,
              type: fileMetadata.type
            };
            statusMessage.value = `File received successfully: ${fileMetadata.name}`;
          }
        }
      });
    });

    // Handle errors
    peer.on('error', (err) => {
      statusMessage.value = `PeerJS Error: ${err.type}`;
      console.error('PeerJS Error:', err);
    });
  });
});

// --- Methods ---
function handleFileSelect(event) {
  fileToSend.value = event.target.files[0];
}

function sendFile() {
  if (!fileToSend.value) {
    alert('Please select a file first.');
    return;
  }
  if (!recipientPeerId.value) {
    alert('Please enter a recipient Peer ID.');
    return;
  }

  statusMessage.value = `Connecting to peer: ${recipientPeerId.value}...`;
  
  // 1. Connect to the recipient's peer ID
  const conn = peer.connect(recipientPeerId.value);

  conn.on('open', () => {
    statusMessage.value = `Connection established. Sending file: ${fileToSend.value.name}`;

    // 2. Send file metadata first
    conn.send({
      type: 'metadata',
      name: fileToSend.value.name,
      type: fileToSend.value.type,
      size: fileToSend.value.size
    });

    // 3. Chunk and send the file data
    const chunkSize = 64 * 1024; // 64KB chunks
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (event) => {
      conn.send(event.target.result);
      offset += event.target.result.byteLength;

      if (offset < fileToSend.value.size) {
        readSlice(offset);
      } else {
        statusMessage.value = `File sent successfully!`;
      }
    };
    
    reader.onerror = (err) => console.error('FileReader Error:', err);

    function readSlice(o) {
      const slice = fileToSend.value.slice(o, o + chunkSize);
      reader.readAsArrayBuffer(slice);
    }

    // Start the reading process
    readSlice(0);
  });
  
  conn.on('error', (err) => {
    statusMessage.value = `Connection Error: ${err}`;
    console.error('Connection Error:', err);
  });
}
</script>

<template>
  <div id="app-container">
    <h1>P2P File Transfer</h1>
    <p class="status">{{ statusMessage }}</p>

    <div class="card">
      <h2>Your Identity</h2>
      <p>Your Peer ID is: <strong class="peer-id">{{ myPeerId || 'Connecting...' }}</strong></p>
      <p class="info">Share this ID with a friend so they can send you a file.</p>
    </div>

    <div class="card">
      <h2>Send a File</h2>
      <div class="form-group">
        <label for="recipient-id">Recipient's Peer ID:</label>
        <input type="text" id="recipient-id" v-model="recipientPeerId" placeholder="Enter recipient ID">
      </div>
      <div class="form-group">
        <label for="file-input">Select File:</label>
        <input type="file" id="file-input" @change="handleFileSelect">
      </div>
      <button @click="sendFile">Send File</button>
    </div>

    <div v-if="receivedFileData.blob" class="card received-file">
      <h2>File Received!</h2>
      <p>
        You have received: <strong>{{ receivedFileData.name }}</strong>
      </p>
      <a :href="receivedFileData.blob" :download="receivedFileData.name" class="download-link">
        Download File
      </a>
    </div>
  </div>
</template>

<style>
/* Add some basic styling to make it look nice */
#app-container {
  max-width: 800px;
  margin: 2rem auto;
  padding: 1rem;
  font-family: sans-serif;
  color: #333;
}
.card {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.status {
  background-color: #eef;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border-left: 5px solid #4a4aff;
  margin-bottom: 1rem;
}
.peer-id {
  color: #4a4aff;
  font-weight: bold;
  word-break: break-all;
}
.info {
  font-size: 0.9em;
  color: #666;
}
.form-group {
  margin-bottom: 1rem;
}
label {
  display: block;
  margin-bottom: 0.5rem;
}
input[type="text"], input[type="file"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
button {
  background-color: #4a4aff;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
}
button:hover {
  background-color: #3535dd;
}
.received-file {
  background-color: #e6ffed;
  border-left-color: #00c853;
}
.download-link {
  display: inline-block;
  margin-top: 1rem;
  background-color: #00c853;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  text-decoration: none;
}
.download-link:hover {
  background-color: #009624;
}
</style>
```

---

## 4. How to Run It

1.  **Run the PeerJS Server**: The easiest way is to use the npx command, which will download and run the PeerJS server. It needs to be on a different port from your signaling server and Vue app.
    ```bash
    # In a new terminal
    npx peerjs --port 9000 --path /myapp
    ```

2.  **Run the Signaling Server**:
    ```bash
    # In another terminal
    node server.js
    ```

3.  **Run the Vue App**:
    ```bash
    # In your main project terminal
    npm run dev
    ```

4.  **Test the Transfer**:
    *   Open your Vue app in two different browser tabs (or different browsers).
    *   Each tab will get a unique Peer ID.
    *   In Tab 1, copy the Peer ID from Tab 2 into the "Recipient's Peer ID" field.
    *   In Tab 1, select a file and click "Send File".
    *   You will see status messages appear, and a "File Received!" card with a download link should appear in Tab 2.

This setup provides a complete, albeit simple, foundation for a P2P file transfer application. You can build on this by adding features like a user list, multi-file transfers, or error handling.
