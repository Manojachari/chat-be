const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://liveeechatdemo.netlify.app',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(cors({
  origin: 'https://liveeechatdemo.netlify.app',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

io.use((socket, next) => {
  const token = socket.handshake.auth.token?.replace('Bearer ', '');
  if (!token) return next(new Error('Authentication error'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.user.id);

  socket.on('joinRoom', async ({ room }) => {
    socket.join(room);
    socket.broadcast.to(room).emit('message', {
      user: 'System',
      text: `User ${socket.user.id} has joined`
    });

    const messages = await Message.find({ room }).sort({ timestamp: -1 }).limit(50);
    socket.emit('loadMessages', messages.reverse());
  });

  socket.on('sendMessage', async ({ room, text }) => {
    console.log('Received:', { room, text });
    const message = new Message({ room, user: socket.user.id.toString(), text });
    try {
      await message.save();
      console.log('Saved:', message._id);
      io.to(room).emit('message', { user: socket.user.id, text });
    } catch (err) {
      console.error('Error:', err);
      socket.emit('error', { msg: 'Save failed' });
    }
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('message', {
      user: 'System',
      text: `User ${socket.user.id} has left`
    });
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/upload', require('./routes/upload'));

server.listen(5000, () => console.log('Server running on port 5000'));