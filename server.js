const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const Poll = require('./Poll');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.log('MongoDB connection error:', err));

// Helper: generate a random 5-character room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Route: Create a new poll
app.post('/api/create-poll', async (req, res) => {
  const { question, options } = req.body;

  if (!question || !options || options.length < 2) {
    return res.status(400).json({ error: 'Question and at least 2 options are required' });
  }

  const roomCode = generateRoomCode();

  const formattedOptions = options.map(text => ({ text, votes: 0 }));

  const newPoll = new Poll({
    roomCode,
    question,
    options: formattedOptions
  });

  await newPoll.save();

  res.json({ roomCode, poll: newPoll });
});

// Route: Get poll data by room code (used when someone joins)
app.get('/api/poll/:roomCode', async (req, res) => {
  const poll = await Poll.findOne({ roomCode: req.params.roomCode });

  if (!poll) {
    return res.status(404).json({ error: 'Poll not found' });
  }

  res.json(poll);
});

// Socket.io real-time logic
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // When someone joins a specific poll room
  socket.on('join-room', (roomCode) => {
    socket.join(roomCode);
    console.log(`User ${socket.id} joined room ${roomCode}`);
  });

  // When someone votes
  socket.on('vote', async ({ roomCode, optionIndex }) => {
    const poll = await Poll.findOne({ roomCode });

    if (!poll) return;

    poll.options[optionIndex].votes += 1;
    await poll.save();

    // Broadcast updated results to everyone in this room
    io.to(roomCode).emit('poll-updated', poll);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});