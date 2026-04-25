require('dotenv').config({ path: __dirname + '/.env' })
const express = require('express')
const http = require("http");
const { Server } = require("socket.io");
const connectomango = require('./database')
const cors=require('cors')
const path=require('path')
const app = express()
const port = 5000

app.use(cors({
    origin: [
        process.env.FRONTEND_URL,
        'http://localhost:5173',
        'https://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'auth-token', 'Authorization'],
}));
 
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth',require('./Routes/auth'))
app.use('/api/datatras',require('./Routes/datatras'))
app.use('/api/models',require('./Routes/models'))
app.use('/api/chat', require('./Routes/chat'));

//check the capital and small in name
app.use("/api/appointments", require("./Routes/Appointments"));
app.use('/api/consultation',  require('./Routes/consultation'));

console.log("ENV CHECK:", {
  MONGO_URI: process.env.MONGO_URI,
});
// ─────────────────────────────────────────────────────────────────────────────
// START SERVER  (replace your existing app.listen with this)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Virtual Hospital API running' });
});
 
// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
});
 
// ─── Local dev server (not used by Vercel) ────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`[SERVER] REST API running on port ${PORT}`));
}
connectomango();
// Vercel needs the app exported
module.exports = app;
