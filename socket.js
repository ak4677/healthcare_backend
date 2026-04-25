/**
 * backend/socket.js
 * ==================
 * Standalone Socket.io server — deploy this on Railway.
 * Handles two features:
 *   1. WebRTC signaling for video/audio calls (appointments)
 *   2. Doctor ↔ Patient live text chat for consultations
 *
 * Run locally:  node socket.js
 * Railway:      set start command to "node socket.js"
 */

require('dotenv').config();
const http    = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingTimeout: 60000,
});

// ── Track active rooms ─────────────────────────────────────────────────────────
// rooms[roomId] = [socketId, socketId]
const rooms = {};

// ── Track online users ─────────────────────────────────────────────────────────
// onlineUsers[userId] = socketId
const onlineUsers = {};

io.on('connection', (socket) => {
    console.log('[socket.io] connected:', socket.id);

    // ── User registers their identity on connect ──────────────────────────────
    // Frontend should emit this immediately after connecting
    // payload: { userId }
    socket.on('register', ({ userId }) => {
        if (userId) {
            onlineUsers[userId] = socket.id;
            socket.userId = userId;
            console.log(`[socket.io] user ${userId} registered → ${socket.id}`);
        }
    });

    // ════════════════════════════════════════════════════════════════════════════
    // CONSULTATION CHAT
    // Doctor and patient message each other in real-time.
    // Messages are also persisted in MongoDB via the REST API.
    // ════════════════════════════════════════════════════════════════════════════

    // Join a consultation chat room
    // payload: { consultationRoomId }  e.g. "chat_doctorId_patientId"
    socket.on('join-consultation', ({ consultationRoomId }) => {
        socket.join(consultationRoomId);
        console.log(`[socket.io] ${socket.id} joined consultation room: ${consultationRoomId}`);
    });

    // Send a chat message
    // payload: { consultationRoomId, message: { senderId, senderName, text, timestamp } }
    socket.on('send-message', ({ consultationRoomId, message }) => {
        // Broadcast to everyone ELSE in the room (sender already sees their own message)
        socket.to(consultationRoomId).emit('receive-message', message);
    });

    // Doctor is typing indicator
    // payload: { consultationRoomId, name }
    socket.on('typing', ({ consultationRoomId, name }) => {
        socket.to(consultationRoomId).emit('user-typing', { name });
    });

    socket.on('stop-typing', ({ consultationRoomId }) => {
        socket.to(consultationRoomId).emit('user-stop-typing');
    });

    // ════════════════════════════════════════════════════════════════════════════
    // VIDEO CALL — WebRTC SIGNALING
    // ════════════════════════════════════════════════════════════════════════════

    // Join a video call room (appointment room_id from MongoDB)
    // payload: { roomId, role: 'patient' | 'doctor' }
    socket.on('join-room', ({ roomId, role }) => {
        if (!roomId) return;
        socket.join(roomId);
        rooms[roomId] = rooms[roomId] || [];
        rooms[roomId].push(socket.id);
        console.log(`[socket.io] ${role} (${socket.id}) joined video room: ${roomId}`);
        // Tell the other peer so they can initiate the WebRTC offer
        socket.to(roomId).emit('peer-joined', { role });
    });

    // WebRTC signaling relay — just forward, never inspect SDP
    socket.on('offer',         ({ roomId, offer })     => socket.to(roomId).emit('offer', { offer }));
    socket.on('answer',        ({ roomId, answer })    => socket.to(roomId).emit('answer', { answer }));
    socket.on('ice-candidate', ({ roomId, candidate }) => socket.to(roomId).emit('ice-candidate', { candidate }));

    // In-call text chat (during video call)
    socket.on('call-chat-message', ({ roomId, from, text, timestamp }) => {
        socket.to(roomId).emit('call-chat-message', { from, text, timestamp });
    });

    // End call
    socket.on('call-ended', ({ roomId }) => {
        socket.to(roomId).emit('call-ended');
        delete rooms[roomId];
        console.log(`[socket.io] room ${roomId} closed`);
    });

    // ════════════════════════════════════════════════════════════════════════════
    // DISCONNECT
    // ════════════════════════════════════════════════════════════════════════════
    socket.on('disconnect', () => {
        console.log('[socket.io] disconnected:', socket.id);

        // Remove from onlineUsers
        if (socket.userId) {
            delete onlineUsers[socket.userId];
        }

        // Notify video call peers
        for (const roomId of Object.keys(rooms)) {
            if (rooms[roomId]?.includes(socket.id)) {
                socket.to(roomId).emit('peer-left');
                rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
                if (!rooms[roomId].length) delete rooms[roomId];
            }
        }
    });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'Virtual Hospital Socket Server', connections: io.engine.clientsCount });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.SOCKET_PORT || 4000;
server.listen(PORT, () => {
    console.log(`[socket.js] Socket.io server running on port ${PORT}`);
});