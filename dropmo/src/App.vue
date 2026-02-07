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
  const PEER_HOST = import.meta.env.VITE_PEER_HOST || window.location.hostname;
  const SIGNALING_HOST = import.meta.env.VITE_SIGNALING_HOST || window.location.origin;


  // 1. Connect to our signaling server
  socket = io(SIGNALING_HOST);

  socket.on('connect', () => {
   statusMessage.value = `Connecting to ${SIGNALING_HOST}...`;
   
    // 2. Initialize PeerJS
    // Pass an empty string to let the PeerServer generate an ID for us.
    peer = new Peer('', {
      host: PEER_HOST, 
      port: 9000,
      path: '/', // Default path for peerjs-server Docker image
      secure: false //not using TLS 
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
