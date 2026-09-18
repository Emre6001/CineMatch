const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const os = require('os');
const movies = require('./data/movies');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to sanitize inputs and prevent XSS
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 32).replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return c;
    }
  });
}

// Generate human-friendly 4-letter room code (e.g., CINE-489)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CINE-${code}`;
}

// Helper to determine the local network IP so users can connect from phones
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// In-Memory Room Store
// Key: roomCode -> room state
const rooms = new Map();

// Health check endpoint for Render / cloud deployment
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime() });
});

// REST API Endpoints
app.get('/api/info', (req, res) => {
  res.json({
    localIp: getLocalNetworkIp(),
    port: process.env.PORT || 3000,
    movieCount: movies.length
  });
});

app.get('/api/genres', (req, res) => {
  const genreSet = new Set();
  movies.forEach(m => m.genres.forEach(g => genreSet.add(g)));
  res.json({ genres: Array.from(genreSet).sort() });
});

app.get('/api/movies', (req, res) => {
  const { genre } = req.query;
  if (!genre || genre.toLowerCase() === 'all') {
    return res.json(movies);
  }
  const filtered = movies.filter(m => 
    m.genres.some(g => g.toLowerCase() === genre.toLowerCase())
  );
  res.json(filtered);
});

// Real-time Socket.io Engine
io.on('connection', (socket) => {
  console.log('⚡ Client connected:', socket.id);
  let currentRoomCode = null;

  // 1. Create Room
  socket.on('room:create', ({ hostName, selectedGenres }, callback) => {
    console.log('📥 room:create received from', socket.id, 'Host:', hostName);
    const cleanHostName = sanitizeText(hostName) || 'Host';
    const roomCode = generateRoomCode();

    // Filter deck according to genres
    let deck = [...movies];
    if (selectedGenres && selectedGenres.length > 0 && !selectedGenres.includes('All')) {
      deck = deck.filter(movie => 
        movie.genres.some(g => selectedGenres.includes(g))
      );
    }
    // Shuffle the deck so each session feels fresh
    deck.sort(() => Math.random() - 0.5);

    const room = {
      code: roomCode,
      createdAt: Date.now(),
      selectedGenres: selectedGenres || ['All'],
      hostSocketId: socket.id,
      members: [
        {
          id: socket.id,
          name: cleanHostName,
          isHost: true,
          cardIndex: 0,
          finished: false
        }
      ],
      deck: deck,
      votes: {}, // [movieId]: { [socketId]: boolean }
      matches: [], // Array of matched movie objects
      started: false
    };

    rooms.set(roomCode, room);
    currentRoomCode = roomCode;
    socket.join(roomCode);

    callback({
      success: true,
      roomCode,
      room: {
        code: room.code,
        members: room.members,
        selectedGenres: room.selectedGenres,
        isHost: true,
        deckSize: room.deck.length
      }
    });
  });

  // 2. Join Room
  socket.on('room:join', ({ roomCode, userName }, callback) => {
    const cleanCode = (roomCode || '').trim().toUpperCase();
    const cleanName = sanitizeText(userName) || 'Friend';
    const room = rooms.get(cleanCode);

    if (!room) {
      return callback({ success: false, error: 'Room not found. Please check your code.' });
    }

    if (room.members.length >= 8) {
      return callback({ success: false, error: 'Room is currently full (max 8 members).' });
    }

    // Check if user already in room
    const existing = room.members.find(m => m.id === socket.id);
    if (!existing) {
      room.members.push({
        id: socket.id,
        name: cleanName,
        isHost: false,
        cardIndex: 0,
        finished: false
      });
    }

    currentRoomCode = cleanCode;
    socket.join(cleanCode);

    // Notify all members of updated member list
    io.to(cleanCode).emit('room:members_updated', {
      members: room.members,
      started: room.started
    });

    callback({
      success: true,
      roomCode: cleanCode,
      room: {
        code: room.code,
        members: room.members,
        selectedGenres: room.selectedGenres,
        isHost: room.hostSocketId === socket.id,
        deck: room.started ? room.deck : null,
        deckSize: room.deck.length,
        started: room.started,
        matches: room.matches
      }
    });
  });

  // 3. Start Session (Host Only)
  socket.on('session:start', ({ roomCode }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) return callback && callback({ success: false, error: 'Room not found' });
    if (room.hostSocketId !== socket.id) {
      return callback && callback({ success: false, error: 'Only the host can start the movie swiping session' });
    }

    room.started = true;
    // Broadcast to all participants that swiping has begun with the full deck
    io.to(roomCode).emit('session:started', {
      deck: room.deck
    });

    if (callback) callback({ success: true });
  });

  // 4. Cast Vote (Yes / No)
  socket.on('vote:cast', ({ roomCode, movieId, vote, cardIndex }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Verify member belongs to this room
    const member = room.members.find(m => m.id === socket.id);
    if (!member) return;

    // Update member's current card progress
    member.cardIndex = cardIndex;
    if (cardIndex >= room.deck.length) {
      member.finished = true;
    }

    // Record vote
    if (!room.votes[movieId]) {
      room.votes[movieId] = {};
    }
    room.votes[movieId][socket.id] = !!vote;

    // Consensus Check:
    // If every active member in the room voted YES, then it's a MATCH!
    if (vote === true) {
      const activeMemberIds = room.members.map(m => m.id);
      const allVotedYes = activeMemberIds.length > 0 && activeMemberIds.every(id => room.votes[movieId][id] === true);

      // Verify not already recorded as a match
      const alreadyMatched = room.matches.some(m => m.id === movieId);
      if (allVotedYes && !alreadyMatched) {
        const movieObj = room.deck.find(m => m.id === movieId) || movies.find(m => m.id === movieId);
        if (movieObj) {
          room.matches.push(movieObj);

          // Broadcast unanimous match celebration to everyone in the room!
          io.to(roomCode).emit('match:found', {
            movie: movieObj,
            totalMatches: room.matches.length,
            allMatches: room.matches,
            members: room.members.map(m => m.name)
          });
        }
      }
    }

    // Broadcast member progress so friends see who is actively swiping
    io.to(roomCode).emit('room:progress_updated', {
      members: room.members.map(m => ({
        id: m.id,
        name: m.name,
        isHost: m.isHost,
        progress: Math.min(100, Math.round((m.cardIndex / room.deck.length) * 100)),
        finished: m.finished
      }))
    });
  });

  // 5. Undo Vote (Rewind to Previous Card)
  socket.on('vote:undo', ({ roomCode, movieId, cardIndex }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const member = room.members.find(m => m.id === socket.id);
    if (!member) return;

    member.cardIndex = cardIndex;
    member.finished = false;

    if (room.votes[movieId]) {
      delete room.votes[movieId][socket.id];
    }

    // If removing this vote breaks consensus, remove from matches
    const matchIndex = room.matches.findIndex(m => m.id === movieId);
    if (matchIndex !== -1) {
      room.matches.splice(matchIndex, 1);
      io.to(roomCode).emit('matches:updated', {
        allMatches: room.matches,
        totalMatches: room.matches.length
      });
    }

    io.to(roomCode).emit('room:progress_updated', {
      members: room.members.map(m => ({
        id: m.id,
        name: m.name,
        isHost: m.isHost,
        progress: Math.min(100, Math.round((m.cardIndex / room.deck.length) * 100)),
        finished: m.finished
      }))
    });
  });

  // 6. Finish Early
  socket.on('member:finish_early', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const member = room.members.find(m => m.id === socket.id);
    if (!member) return;

    member.finished = true;
    member.cardIndex = room.deck.length;

    io.to(roomCode).emit('room:progress_updated', {
      members: room.members.map(m => ({
        id: m.id,
        name: m.name,
        isHost: m.isHost,
        progress: 100,
        finished: true
      }))
    });
  });

  // 7. Member disconnect / leave
  socket.on('disconnect', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    room.members = room.members.filter(m => m.id !== socket.id);

    // If host left and there are other members, promote the next member as host
    if (room.hostSocketId === socket.id && room.members.length > 0) {
      room.hostSocketId = room.members[0].id;
      room.members[0].isHost = true;
    }

    if (room.members.length === 0) {
      // Clean up empty room after 10 minutes
      setTimeout(() => {
        const r = rooms.get(currentRoomCode);
        if (r && r.members.length === 0) {
          rooms.delete(currentRoomCode);
        }
      }, 10 * 60 * 1000);
    } else {
      io.to(currentRoomCode).emit('room:members_updated', {
        members: room.members,
        started: room.started
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalNetworkIp();
  console.log(`===================================================`);
  console.log(`🎬 CineMatch Server is running!`);
  console.log(`> Local Browser:   http://localhost:${PORT}`);
  console.log(`> Friends/Phones:  http://${localIp}:${PORT}`);
  console.log(`===================================================`);
});
