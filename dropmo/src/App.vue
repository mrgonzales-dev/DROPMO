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

const availablePeers = ref([]); // Store active peer IDs from signaling server
const selectedRecipientPeerIds = ref([]); // Selected peer IDs for sending

let peer = null;
let socket = null;

// --- Lifecycle Hook ---
onMounted(() => {
  const PEER_HOST = import.meta.env.VITE_PEER_HOST || window.location.hostname;
  const SIGNALING_HOST = import.meta.env.VITE_SIGNALING_HOST || window.location.origin;


  socket = io(SIGNALING_HOST);

  socket.on('connect', () => {
   statusMessage.value = `Connecting to ${SIGNALING_HOST}...`;
   
    peer = new Peer('', {
      host: PEER_HOST, 
      port: 9000,
      path: '/', // Default path for peerjs-server Docker image
      secure: false //not using TLS
    });

    // Listen for updates to the list of active peers
    socket.on('active-peers-update', (peerIds) => {
      // Filter out our own peer ID from the list
      availablePeers.value = peerIds.filter(id => id !== myPeerId.value);
      console.log('Active peers updated:', availablePeers.value);
    });

    //successful conneciton
    peer.on('open', (id) => {
      myPeerId.value = id;
      statusMessage.value = `Your Peer ID is: ${id}`;
      // Register our new PeerJS ID with the signaling server
      socket.emit('register-peer', id);
      // Request the initial list of active peers
      socket.emit('get-active-peers');
    });

   // 4. Listen for incoming data connections
peer.on('connection', (conn) => {
  statusMessage.value = `Incoming connection from ${conn.peer}`;
  
  const fileChunks = [];
  let fileMetadata = {};

  conn.on('open', () => {
    console.log(`Data connection with ${conn.peer} established successfully.`);
    // Send ready signal to sender
    conn.send({ type: 'ready' });
    statusMessage.value = `Ready to receive from ${conn.peer}`;
  });

  conn.on('data', (data) => {
    // Ignore the ready acknowledgment from sender
    if (data.type === 'ready-ack') {
      console.log('Sender acknowledged ready state');
      return;
    }

    // The first piece of data should be metadata
    if (data.type === 'metadata') {
      fileMetadata = { name: data.name, type: data.type, size: data.size };
      statusMessage.value = `Receiving file: ${fileMetadata.name} (${fileMetadata.size} bytes)`;
    } else {
      // Subsequent data are file chunks
      fileChunks.push(data);
      const receivedSize = fileChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      
      if (fileMetadata.size !== undefined) {
         const percentage = fileMetadata.size === 0 ? 100 : Math.round((receivedSize / fileMetadata.size) * 100);
         statusMessage.value = `Receiving file: ${fileMetadata.name}... ${percentage}%`;
      }

      // When all chunks are received
      if (fileMetadata.size !== undefined && receivedSize === fileMetadata.size) {
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

  conn.on('close', () => {
      console.log(`Data connection with ${conn.peer} closed.`);
  });

  conn.on('error', (err) => {
      console.error(`Data connection error with ${conn.peer}:`, err);
      statusMessage.value = `Data connection error with ${conn.peer}: ${err.message || err}`;
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

function scanForPeers() {
  socket.emit('get-active-peers');
}

function sendFile() {
  if (!fileToSend.value) {
    alert('Please select a file first.');
    return;
  }
  if (selectedRecipientPeerIds.value.length === 0) {
    alert('Please select at least one recipient.');
    return;
  }

  selectedRecipientPeerIds.value.forEach(recipientId => {
    statusMessage.value = `Connecting to peer: ${recipientId}...`;
    
    const conn = peer.connect(recipientId, {
      reliable: true
    });

    let isReady = false;

    conn.on('open', () => {
      statusMessage.value = `Connection established with ${recipientId}. Waiting for receiver...`;
    });

    conn.on('data', (data) => {
      // Wait for ready signal from receiver
      if (data.type === 'ready' && !isReady) {
        isReady = true;
        statusMessage.value = `Receiver ready. Sending file: ${fileToSend.value.name}`;
        
        // Acknowledge ready state
        conn.send({ type: 'ready-ack' });

        // Now start sending the file
        startFileTransfer(conn, recipientId);
      }
    });
    
    conn.on('error', (err) => {
      statusMessage.value = `Connection Error with ${recipientId}: ${err}`;
      console.error('Connection Error:', err, recipientId);
    });

    conn.on('close', () => {
      console.log(`Connection closed with ${recipientId}`);
    });
  });
}

// Separate function to handle file transfer
function startFileTransfer(conn, recipientId) {
  // Send file metadata first
  conn.send({
    type: 'metadata',
    name: fileToSend.value.name,
    type: fileToSend.value.type,
    size: fileToSend.value.size
  });

  // Chunk and send the file data
  const chunkSize = 64 * 1024; // 64KB chunks
  let offset = 0;
  const reader = new FileReader();

  reader.onload = (event) => {
    if (conn.open) {
      conn.send(event.target.result);
      offset += event.target.result.byteLength;

      const progress = Math.round((offset / fileToSend.value.size) * 100);
      statusMessage.value = `Sending to ${recipientId}: ${progress}%`;

      if (offset < fileToSend.value.size) {
        readSlice(offset);
      } else {
        statusMessage.value = `File sent successfully to ${recipientId}!`;
      }
    } else {
      console.error('Connection closed during transfer');
      statusMessage.value = `Connection lost with ${recipientId}`;
    }
  };
  
  reader.onerror = (err) => {
    console.error('FileReader Error:', err);
    statusMessage.value = `Error reading file: ${err}`;
  };

  function readSlice(o) {
    const slice = fileToSend.value.slice(o, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  }

  // Start the reading process
  readSlice(0);
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
        <label for="file-input">Select File:</label>
        <input type="file" id="file-input" @change="handleFileSelect">
      </div>

      <div class="form-group">
        <h3>Available Peers</h3>
        <button @click="scanForPeers">Scan for Peers</button>
        <div v-if="availablePeers.length > 0" class="peer-list">
          <div v-for="peerId in availablePeers" :key="peerId" class="peer-item">
            <input type="checkbox" :id="peerId" :value="peerId" v-model="selectedRecipientPeerIds">
            <label :for="peerId">{{ peerId }}</label>
          </div>
        </div>
        <p v-else>No other peers available. Click 'Scan for Peers' to refresh.</p>
      </div>
      
      <button @click="sendFile" :disabled="!fileToSend || selectedRecipientPeerIds.length === 0">Send File</button>
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
