# PeerJS and Socket.IO Overview

This document provides a high-level overview of how PeerJS and Socket.IO can be used together to create real-time, peer-to-peer (P2P) web applications.

## Core Technologies

### PeerJS

PeerJS is a JavaScript library that simplifies the process of creating peer-to-peer connections in the browser using the **WebRTC** standard. WebRTC allows for direct communication between two browsers without the need for a central server to relay data.

**Key Concepts:**

*   **Peer:** Each user in the network is a "peer". Every peer is assigned a unique ID by a PeerServer.
*   **PeerServer:** A server that manages peer IDs and helps broker connections. You can run your own or use a free cloud-based one provided by PeerJS.
*   **Connection:** A link between two peers. There are two main types:
    *   **DataConnection:** For sending any kind of data (text, numbers, objects).
    *   **MediaConnection:** For streaming audio and video.
*   **Signaling:** The process of exchanging connection information (like IP addresses and capabilities) between two peers before a direct connection can be established. This is where Socket.IO comes in.

**Common Functions:**

*   `new Peer(id, options)`: Creates a new peer instance. You can provide your own `id` or let the PeerServer generate one for you.
*   `peer.on('open', id => ...)`: Event fired when the peer successfully connects to the PeerServer.
*   `peer.on('connection', conn => ...)`: Event fired when another peer initiates a data connection with you.
*   `peer.on('call', call => ...)`: Event fired when another peer initiates a media (video/audio) call.
*   `peer.connect(otherPeerId)`: Initiates a `DataConnection` to another peer.
*   `peer.call(otherPeerId, stream)`: Initiates a `MediaConnection` to another peer, sending your local media `stream`.
*   `conn.on('data', data => ...)`: Event for receiving data from a `DataConnection`.
*   `conn.send(data)`: Sends data over a `DataConnection`.

### Socket.IO

Socket.IO is a library that enables real-time, bidirectional, and event-based communication between web clients and servers. It is not a P2P library; it's a client-server library.

**Key Concepts:**

*   **Client/Server Model:** Communication happens between clients and a central server.
*   **Events:** Communication is based on emitting and listening for custom events. You can send any data you want with these events.
*   **Real-time:** It uses WebSockets when possible, with fallbacks to other technologies like HTTP long-polling, to ensure a persistent connection.

**Common Functions:**

*   `io()`: On the client, connects to the Socket.IO server.
*   `socket.on('event-name', data => ...)`: Listens for an event from the server.
*   `socket.emit('event-name', data)`: Sends an event to the server.
*   On the server, you have similar `on` and `emit` functions to handle communication with one or more clients.

## How They Work Together

PeerJS and Socket.IO are a powerful combination because **Socket.IO is perfectly suited to be the signaling server for PeerJS.**

The typical workflow is:

1.  **Client A Connects:**
    *   Client A opens your web app.
    *   It connects to your Socket.IO server.
    *   It creates a `Peer` instance, which connects to a PeerServer and gets a unique PeerJS ID.
    *   Client A sends its new PeerJS ID to the Socket.IO server.

2.  **Client B Connects:**
    *   Client B does the same thing: connects to the Socket.IO server and gets its own PeerJS ID.
    *   Client B tells the Socket.IO server, "I'm here! My PeerJS ID is XYZ."

3.  **Discovery & Signaling:**
    *   The Socket.IO server now knows about both Client A and Client B and their respective PeerJS IDs.
    *   The server can then "introduce" them. For example, it can send a list of active users (and their PeerJS IDs) to all connected clients.
    *   When Client A wants to connect to Client B, it finds B's PeerJS ID from the list it got from the Socket.IO server.

4.  **Establishing a P2P Connection:**
    *   Client A uses `peer.connect(client_B_peer_id)`.
    *   PeerJS uses the PeerServer to handle the complex WebRTC handshake in the background.
    *   Once the handshake is complete, a direct P2P connection is established between Client A and Client B.

5.  **Direct Communication:**
    *   Client A and Client B can now send data directly to each other using `conn.send()` and `conn.on('data', ...)`.
    *   This data **does not** go through your Socket.IO server. It's a direct, faster, and more private link.

## What You Can Do With Them

*   **Real-time Chat Applications:** Create chat rooms where users can send messages directly to each other.
*   **Multiplayer Games:** Synchronize game state between players with low latency.
*   **Video/Audio Conferencing:** Build your own version of Zoom or Google Meet.
*   **Collaborative Tools:** Create whiteboards, text editors, or other tools where multiple users can interact in real-time.
*   **Large File Transfers:** Allow users to send large files directly to each other without having to upload them to your server first, saving you bandwidth.
