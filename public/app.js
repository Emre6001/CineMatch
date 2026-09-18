// =========================================================
// CineMatch Client Application
// =========================================================

const socket = io();

// Application State
const state = {
  roomCode: null,
  userName: localStorage.getItem('cinematch_username') || '',
  isHost: false,
  members: [],
  deck: [],
  currentIndex: 0,
  matches: [],
  soundEnabled: true,
  currentMatchedMovie: null,
  isDragging: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0
};

// Web Audio API Synthesizer for instant zero-dependency sound effects
class SoundEngine {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }
  playWhoosh() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  }
  playChime() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(0.15, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.3);
      });
    } catch (e) {}
  }
  playMatchFanfare() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Upbeat victory chords: C5, E5, G5, C6
      const chord = [523.25, 659.25, 783.99, 1046.50];
      chord.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.12, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.6);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.6);
      });
    } catch (e) {}
  }
}

const sounds = new SoundEngine();

// =========================================================
// Initialization & DOM Loading
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  // Pre-fill saved name
  if (state.userName) {
    document.getElementById('hostNameInput').value = state.userName;
    document.getElementById('joinNameInput').value = state.userName;
  }

  // Load available genres
  fetchGenres();


  // Check URL parameters for direct room join (e.g. ?room=CINE-ABCD)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    switchLobbyTab('join');
    const joinCodeInput = document.getElementById('joinCodeInput');
    if (joinCodeInput) joinCodeInput.value = roomParam.toUpperCase();
    showToast(`Joining room: ${roomParam}`);
  }

  // Register keyboard controls
  document.addEventListener('keydown', handleKeyboardShortcuts);
});

// Sound Toggle
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  const btn = document.getElementById('soundToggleBtn');
  btn.textContent = state.soundEnabled ? '🔊' : '🔇';
  showToast(state.soundEnabled ? 'Sound effects enabled' : 'Sound effects muted');
}

// Fetch Genres from Server
async function fetchGenres() {
  try {
    const res = await fetch('/api/genres');
    const data = await res.json();
    const container = document.getElementById('genreChips');
    if (!container) return;

    container.innerHTML = '';

    // "All Genres" Chip
    const allChip = document.createElement('div');
    allChip.className = 'genre-chip selected';
    allChip.textContent = 'All Genres';
    allChip.dataset.genre = 'All';
    allChip.onclick = () => toggleGenreChip(allChip);
    container.appendChild(allChip);

    // Individual Genre Chips
    data.genres.forEach(genre => {
      const chip = document.createElement('div');
      chip.className = 'genre-chip';
      chip.textContent = genre;
      chip.dataset.genre = genre;
      chip.onclick = () => toggleGenreChip(chip);
      container.appendChild(chip);
    });
  } catch (err) {
    console.error('Failed to load genres:', err);
  }
}

// Toggle Genre Chips in Host Lobby
function toggleGenreChip(chip) {
  const isAll = chip.dataset.genre === 'All';
  const allChip = document.querySelector('.genre-chip[data-genre="All"]');

  if (isAll) {
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    return;
  }

  if (allChip) allChip.classList.remove('selected');
  chip.classList.toggle('selected');

  // If nothing is selected, revert back to "All Genres"
  const anySelected = document.querySelectorAll('.genre-chip.selected').length > 0;
  if (!anySelected && allChip) {
    allChip.classList.add('selected');
  }
}

function getSelectedGenres() {
  const selected = [];
  document.querySelectorAll('.genre-chip.selected').forEach(c => {
    selected.push(c.dataset.genre);
  });
  return selected.length > 0 ? selected : ['All'];
}

// Switch between Host and Join tabs
function switchLobbyTab(tab) {
  const tabCreate = document.getElementById('tabCreate');
  const tabJoin = document.getElementById('tabJoin');
  const createForm = document.getElementById('createPartyForm');
  const joinForm = document.getElementById('joinPartyForm');

  if (tab === 'create') {
    tabCreate.classList.add('active');
    tabJoin.classList.remove('active');
    createForm.classList.add('active');
    joinForm.classList.remove('active');
  } else {
    tabJoin.classList.add('active');
    tabCreate.classList.remove('active');
    joinForm.classList.add('active');
    createForm.classList.remove('active');
  }
}

// Connection State Logging
socket.on('connect', () => {
  console.log('⚡ Connected to CineMatch server with ID:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('❌ Socket connection error:', err);
  showToast('Connection error. Reconnecting...');
});

function handleCreateRoom(e) {
  if (e && e.preventDefault) e.preventDefault();
  const nameInput = document.getElementById('hostNameInput');
  const hostName = (nameInput ? nameInput.value.trim() : '') || 'Host';
  state.userName = hostName;
  localStorage.setItem('cinematch_username', hostName);

  const selectedGenres = getSelectedGenres();
  console.log('🚀 Attempting to create room for:', hostName, 'with genres:', selectedGenres);

  if (!socket.connected) {
    showToast('Connecting to server... Please wait a moment.');
    socket.connect();
  }

  showToast('Creating room...');

  socket.emit('room:create', { hostName, selectedGenres }, (response) => {
    console.log('📥 Room create response received:', response);
    if (response && response.success) {
      state.roomCode = response.roomCode;
      state.isHost = true;
      enterWaitingRoom(response.room);
      showToast(`Party created! Room code: ${response.roomCode}`);
    } else {
      showToast((response && response.error) || 'Failed to create room');
    }
  });
}

function handleJoinRoom(e) {
  e.preventDefault();
  const nameInput = document.getElementById('joinNameInput');
  const codeInput = document.getElementById('joinCodeInput');

  const userName = nameInput.value.trim() || 'Friend';
  const roomCode = codeInput.value.trim().toUpperCase();

  state.userName = userName;
  localStorage.setItem('cinematch_username', userName);

  socket.emit('room:join', { roomCode, userName }, (response) => {
    if (response && response.success) {
      state.roomCode = response.roomCode;
      state.isHost = response.room.isHost;
      enterWaitingRoom(response.room);
      showToast(`Joined party ${response.roomCode}!`);

      // If session was already started, jump into the deck
      if (response.room.started && response.room.deck) {
        startSwiperView(response.room.deck);
      }
    } else {
      showToast(response.error || 'Could not join room. Check code!');
    }
  });
}

function enterWaitingRoom(room) {
  // Hide lobby tabs and forms
  document.getElementById('lobbyTabs').style.display = 'none';
  document.getElementById('createPartyForm').style.display = 'none';
  document.getElementById('joinPartyForm').style.display = 'none';

  // Show Waiting Room
  const waitingRoom = document.getElementById('waitingRoom');
  waitingRoom.style.display = 'block';

  // Set codes
  document.getElementById('lobbyRoomCode').innerHTML = `${room.code} <span class="copy-hint">Copy Link</span>`;
  document.getElementById('displayRoomCode').textContent = room.code;
  document.getElementById('roomCodeBadge').style.display = 'block';

  // Update participants
  updateParticipantsList(room.members);

  // Host vs Guest buttons
  if (state.isHost) {
    document.getElementById('startSessionBtn').style.display = 'inline-flex';
    document.getElementById('guestWaitingMsg').style.display = 'none';
  } else {
    document.getElementById('startSessionBtn').style.display = 'none';
    document.getElementById('guestWaitingMsg').style.display = 'flex';
  }
}

function updateParticipantsList(members) {
  state.members = members;
  const countElem = document.getElementById('participantCount');
  if (countElem) countElem.textContent = members.length;

  const grid = document.getElementById('participantsGrid');
  if (!grid) return;

  grid.innerHTML = '';
  members.forEach(member => {
    const chip = document.createElement('div');
    chip.className = 'participant-chip';

    const initials = (member.name || 'F').slice(0, 2).toUpperCase();
    chip.innerHTML = `
      <div class="avatar-circle">${initials}</div>
      <div class="participant-meta">
        <span class="participant-name">${member.name}</span>
        ${member.isHost ? '<span class="host-tag">Party Host 👑</span>' : ''}
      </div>
    `;
    grid.appendChild(chip);
  });
}

function startSession() {
  if (!state.isHost) return;
  socket.emit('session:start', { roomCode: state.roomCode }, (res) => {
    if (!res.success) {
      showToast(res.error || 'Failed to start session');
    }
  });
}

// Helper: Open a second tab ready to test as Friend 2
function openFriendTab() {
  const joinUrl = `${window.location.origin}/?room=${state.roomCode}`;
  window.open(joinUrl, '_blank');
}

// Copy Invite Link to Clipboard
function copyRoomLink() {
  const shareUrl = `${window.location.origin}/?room=${state.roomCode}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('Room invite link copied! 📋');
  }).catch(() => {
    showToast(`Room Code: ${state.roomCode}`);
  });
}

// =========================================================
// Swiper View & Interactive Card Deck
// =========================================================

function startSwiperView(deck) {
  state.deck = deck;
  state.currentIndex = 0;

  // Switch active sections
  document.getElementById('lobbyView').style.display = 'none';
  document.getElementById('finishedView').style.display = 'none';
  document.getElementById('swiperView').style.display = 'flex';
  document.getElementById('openMatchesBtn').style.display = 'inline-flex';

  renderCurrentCard();
  updateProgressUI();
}

function renderCurrentCard() {
  const container = document.getElementById('cardContainer');
  container.innerHTML = '';

  if (state.currentIndex >= state.deck.length) {
    showFinishedView();
    return;
  }

  const movie = state.deck[state.currentIndex];
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.id = `movieCard_${movie.id}`;

  // Form genre tags
  const genreTags = movie.genres.map(g => `<span class="movie-genre-badge">${g}</span>`).join('');

  // Form spoiler-free reviews quotes
  const reviewQuotes = movie.spoilerFreeReviews.map(r => `
    <div class="review-quote-card">
      <div class="review-quote-header">
        <span class="review-author">${r.author}</span>
        <span class="review-badge">${r.rating}</span>
      </div>
      <div class="review-quote-text">"${r.quote}"</div>
    </div>
  `).join('');

  card.innerHTML = `
    <!-- LIKE / PASS Drag Stamps -->
    <div class="stamp-indicator stamp-like" id="stampLike">LIKE ❤️</div>
    <div class="stamp-indicator stamp-pass" id="stampPass">PASS ✕</div>

    <!-- Media Poster -->
    <div class="card-media">
      <img src="${movie.poster}" alt="${movie.title} poster" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80';" />
      <div class="card-gradient-overlay"></div>
      
      <div class="badge-rating">
        <span>★</span>
        <span>${movie.rating}</span>
      </div>

      <button type="button" class="trailer-chip-btn" onclick="playTrailer('${movie.trailerYoutubeId}', '${movie.title.replace(/'/g, "\\'")}')">
        <span>▶ Trailer</span>
      </button>
    </div>

    <!-- Body Information -->
    <div class="card-content">
      <div>
        <div class="card-title-row">
          <h2 class="movie-title">${movie.title}</h2>
          <span class="movie-year">${movie.year}</span>
        </div>

        <div class="movie-meta-chips">
          ${genreTags}
          <span class="movie-duration">• ${movie.runtime}</span>
          <span class="movie-duration">• Dir. ${movie.director}</span>
        </div>
      </div>

      <p class="movie-synopsis-preview">${movie.synopsis}</p>
    </div>

    <!-- Expandable Details & Spoiler-free vibes sheet -->
    <div class="card-details-sheet" id="cardDetailsSheet">
      <div class="sheet-header">
        <h4>${movie.title} (${movie.year})</h4>
        <button type="button" class="close-sheet-btn" onclick="toggleDetailsSheet()">✕</button>
      </div>

      <div class="sheet-section">
        <div class="sheet-section-title">Plot Overview</div>
        <p class="sheet-synopsis">${movie.synopsis}</p>
      </div>

      <div class="sheet-section">
        <div class="sheet-section-title">Audience Vibes (No Spoilers)</div>
        ${reviewQuotes}
      </div>

      <button type="button" class="btn btn-primary btn-block btn-sm" onclick="playTrailer('${movie.trailerYoutubeId}', '${movie.title.replace(/'/g, "\\'")}')">
        🎬 Play Full Official Trailer
      </button>
    </div>
  `;

  container.appendChild(card);
  attachCardDragEvents(card);
  updateDeckCounter();
}

function updateDeckCounter() {
  const counter = document.getElementById('deckCounter');
  if (counter) {
    counter.textContent = `Movie ${state.currentIndex + 1} of ${state.deck.length}`;
  }
}

function toggleDetailsSheet() {
  const sheet = document.getElementById('cardDetailsSheet');
  if (sheet) {
    sheet.classList.toggle('active');
  }
}

// =========================================================
// Card Drag / Swipe Physics (Touch + Mouse)
// =========================================================

function attachCardDragEvents(card) {
  // Mouse events
  card.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);

  // Touch events (Phones / Tablets)
  card.addEventListener('touchstart', onDragStart, { passive: false });
  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);
}

function onDragStart(e) {
  // If clicking on details sheet or trailer button, don't drag
  if (e.target.closest('.card-details-sheet') || e.target.closest('.trailer-chip-btn')) return;

  state.isDragging = true;
  const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

  state.startX = clientX;
  state.startY = clientY;
  state.currentX = clientX;
  state.currentY = clientY;

  const card = getCurrentCardElement();
  if (card) card.classList.add('swiping');
}

function onDragMove(e) {
  if (!state.isDragging) return;

  const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

  state.currentX = clientX;
  state.currentY = clientY;

  const deltaX = state.currentX - state.startX;
  const deltaY = state.currentY - state.startY;

  const card = getCurrentCardElement();
  if (!card) return;

  // Rotation proportional to horizontal displacement
  const rotateDeg = deltaX * 0.08;
  card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotateDeg}deg)`;

  // Stamp opacities
  const stampLike = document.getElementById('stampLike');
  const stampPass = document.getElementById('stampPass');

  if (deltaX > 20) {
    if (stampLike) stampLike.style.opacity = Math.min(1, deltaX / 100);
    if (stampPass) stampPass.style.opacity = 0;
  } else if (deltaX < -20) {
    if (stampPass) stampPass.style.opacity = Math.min(1, Math.abs(deltaX) / 100);
    if (stampLike) stampLike.style.opacity = 0;
  } else {
    if (stampLike) stampLike.style.opacity = 0;
    if (stampPass) stampPass.style.opacity = 0;
  }
}

function onDragEnd() {
  if (!state.isDragging) return;
  state.isDragging = false;

  const card = getCurrentCardElement();
  if (!card) return;

  card.classList.remove('swiping');

  const deltaX = state.currentX - state.startX;
  const threshold = 100; // Drag threshold in px

  if (deltaX > threshold) {
    // Swiped Right -> LIKE
    flyOutAndVote(card, true);
  } else if (deltaX < -threshold) {
    // Swiped Left -> PASS
    flyOutAndVote(card, false);
  } else {
    // Snap back to center
    card.style.transform = 'translate(0px, 0px) rotate(0deg)';
    const stampLike = document.getElementById('stampLike');
    const stampPass = document.getElementById('stampPass');
    if (stampLike) stampLike.style.opacity = 0;
    if (stampPass) stampPass.style.opacity = 0;
  }
}

function flyOutAndVote(card, isLike) {
  const flyDirection = isLike ? 1 : -1;
  card.style.transition = 'transform 0.35s ease-out, opacity 0.3s ease';
  card.style.transform = `translate(${flyDirection * (window.innerWidth + 200)}px, ${state.currentY - state.startY}px) rotate(${flyDirection * 30}deg)`;
  card.style.opacity = '0';

  if (isLike) {
    sounds.playChime();
  } else {
    sounds.playWhoosh();
  }

  setTimeout(() => {
    executeVote(isLike);
  }, 220);
}

function getCurrentCardElement() {
  if (!state.deck[state.currentIndex]) return null;
  return document.getElementById(`movieCard_${state.deck[state.currentIndex].id}`);
}

// Button-triggered voting
function castCurrentVote(vote) {
  const card = getCurrentCardElement();
  if (card) {
    flyOutAndVote(card, vote);
  } else {
    executeVote(vote);
  }
}

function executeVote(vote) {
  if (state.currentIndex >= state.deck.length) return;

  const movie = state.deck[state.currentIndex];
  state.currentIndex++;

  // Emit vote to server
  socket.emit('vote:cast', {
    roomCode: state.roomCode,
    movieId: movie.id,
    vote: vote,
    cardIndex: state.currentIndex
  });

  // Render next card
  renderCurrentCard();
}

function showFinishedView() {
  document.getElementById('swiperView').style.display = 'none';
  document.getElementById('finishedView').style.display = 'flex';
  document.getElementById('finishedMatchCount').textContent = state.matches.length;
}

// =========================================================
// Rewind (Go Back) & Finish Early Actions
// =========================================================

function rewindLastVote() {
  if (state.currentIndex <= 0) {
    showToast('Already at the first movie!');
    return;
  }

  state.currentIndex--;
  const movie = state.deck[state.currentIndex];

  // Notify server to cancel vote on this card
  socket.emit('vote:undo', {
    roomCode: state.roomCode,
    movieId: movie.id,
    cardIndex: state.currentIndex
  });

  sounds.playWhoosh();
  renderCurrentCard();
  showToast(`↩️ Rewound: ${movie.title}`);
}

function finishSwipingEarly() {
  socket.emit('member:finish_early', { roomCode: state.roomCode });
  showFinishedView();
  toggleMatchesDrawer();
  showToast('Finished swiping! Checking group matches 🍿');
}

// =========================================================
// Keyboard Navigation
// =========================================================

function handleKeyboardShortcuts(e) {
  // Only trigger if in swiper view and modal is not open
  const swiperView = document.getElementById('swiperView');
  const isSwiping = swiperView && swiperView.style.display !== 'none';
  const trailerActive = document.getElementById('trailerModal').classList.contains('active');
  const matchActive = document.getElementById('matchModal').classList.contains('active');

  if (!isSwiping || trailerActive || matchActive) {
    if (e.key === 'Escape') {
      closeTrailerModal();
      closeMatchModal();
      const drawer = document.getElementById('matchesDrawer');
      if (drawer.classList.contains('active')) toggleMatchesDrawer();
    }
    return;
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    castCurrentVote(false);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    castCurrentVote(true);
  } else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
    e.preventDefault();
    rewindLastVote();
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    playCurrentMovieTrailer();
  } else if (e.key === 'i' || e.key === 'I') {
    e.preventDefault();
    toggleDetailsSheet();
  }
}

// =========================================================
// Trailer Modal Management
// =========================================================

function playCurrentMovieTrailer() {
  if (!state.deck[state.currentIndex]) return;
  const movie = state.deck[state.currentIndex];
  playTrailer(movie.trailerYoutubeId, movie.title);
}

function playTrailer(youtubeId, title) {
  const modal = document.getElementById('trailerModal');
  const iframe = document.getElementById('trailerIframe');
  const titleElem = document.getElementById('trailerModalTitle');
  const ytDirectBtn = document.getElementById('ytDirectBtn');

  titleElem.textContent = `${title} - Official Trailer`;
  if (ytDirectBtn) {
    ytDirectBtn.href = `https://www.youtube.com/watch?v=${youtubeId}`;
  }

  // Use YouTube standard embed with origin parameter
  const origin = window.location.origin;
  iframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(origin)}&rel=0`;
  modal.classList.add('active');
}

function closeTrailerModal() {
  const modal = document.getElementById('trailerModal');
  const iframe = document.getElementById('trailerIframe');
  iframe.src = ''; // Stop video playback
  modal.classList.remove('active');
}

// =========================================================
// Match Celebration (Consensus Reached!)
// =========================================================

function handleMatchFound(data) {
  sounds.playMatchFanfare();
  triggerConfetti();

  state.currentMatchedMovie = data.movie;

  // Add to matches array if not already present
  if (!state.matches.some(m => m.id === data.movie.id)) {
    state.matches.push(data.movie);
    updateMatchesDrawerUI();
  }

  // Update badge
  const badge = document.getElementById('matchesBadge');
  if (badge) badge.textContent = state.matches.length;
  const btnCount = document.getElementById('btnMatchCount');
  if (btnCount) btnCount.textContent = state.matches.length;
  const topBtnCount = document.getElementById('topBtnMatchCount');
  if (topBtnCount) topBtnCount.textContent = state.matches.length;
  const finBadge = document.getElementById('finishedMatchCount');
  if (finBadge) finBadge.textContent = state.matches.length;

  // Populate Celebration Modal
  document.getElementById('matchPosterImg').src = data.movie.poster;
  document.getElementById('matchMovieTitle').textContent = `${data.movie.title} (${data.movie.year})`;
  document.getElementById('matchMovieTagline').textContent = data.movie.tagline || 'A unanimous group favorite!';
  document.getElementById('matchVotersList').textContent = `Agreed by all friends: ${data.members.join(', ')}`;

  document.getElementById('matchModal').classList.add('active');
}

function closeMatchModal() {
  document.getElementById('matchModal').classList.remove('active');
}

function watchMatchedMovieTrailer() {
  if (state.currentMatchedMovie) {
    closeMatchModal();
    playTrailer(state.currentMatchedMovie.trailerYoutubeId, state.currentMatchedMovie.title);
  }
}

// Confetti Cannon
function triggerConfetti() {
  if (typeof confetti === 'function') {
    // Left burst
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { x: 0.2, y: 0.6 }
    });
    // Right burst
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { x: 0.8, y: 0.6 }
    });
  }
}

// =========================================================
// Matches Drawer & Random Tie-Breaker Picker
// =========================================================

function toggleMatchesDrawer() {
  const drawer = document.getElementById('matchesDrawer');
  const overlay = document.getElementById('matchesDrawerOverlay');
  drawer.classList.toggle('active');
  overlay.classList.toggle('active');
}

function updateMatchesDrawerUI() {
  const list = document.getElementById('matchesList');
  const subtitle = document.getElementById('drawerSubtitle');
  const wheelBox = document.getElementById('wheelPickerBox');

  if (subtitle) {
    subtitle.textContent = `${state.matches.length} ${state.matches.length === 1 ? 'movie' : 'movies'} agreed upon`;
  }

  // Show randomizer picker if 2 or more matches
  if (wheelBox) {
    wheelBox.style.display = state.matches.length >= 2 ? 'block' : 'none';
  }

  if (state.matches.length === 0) {
    list.innerHTML = `
      <div class="empty-matches">
        <span class="empty-icon">🍿</span>
        <p>No matches yet!</p>
        <small>When all friends in the room swipe ❤️ Love on the same movie, it will appear here.</small>
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  state.matches.forEach(movie => {
    const item = document.createElement('div');
    item.className = 'match-item-card';
    item.innerHTML = `
      <img class="match-item-poster" src="${movie.poster}" alt="${movie.title}" />
      <div class="match-item-info">
        <div class="match-item-title">${movie.title} (${movie.year})</div>
        <div class="match-item-meta">★ ${movie.rating} • ${movie.runtime} • ${movie.genres.slice(0, 2).join(', ')}</div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="playTrailer('${movie.trailerYoutubeId}', '${movie.title.replace(/'/g, "\\'")}')">
        🎬 Trailer
      </button>
    `;
    list.appendChild(item);
  });
}

function pickRandomMatch() {
  if (state.matches.length < 2) return;

  const resultBox = document.getElementById('randomPickResult');
  resultBox.style.display = 'block';
  resultBox.textContent = '🎲 Rolling...';

  let counter = 0;
  const interval = setInterval(() => {
    const randomMovie = state.matches[Math.floor(Math.random() * state.matches.length)];
    resultBox.textContent = `🎲 ${randomMovie.title}`;
    counter++;
    if (counter > 15) {
      clearInterval(interval);
      const finalPick = state.matches[Math.floor(Math.random() * state.matches.length)];
      resultBox.innerHTML = `🎉 <strong>Tonight's Pick:</strong> ${finalPick.title} (${finalPick.year})!`;
      sounds.playChime();
    }
  }, 80);
}

// =========================================================
// Live Progress & Friends Indicator
// =========================================================

function updateProgressUI() {
  const container = document.getElementById('friendsProgressPills');
  if (!container) return;

  container.innerHTML = '';
  state.members.forEach(member => {
    const pill = document.createElement('span');
    pill.className = 'friend-prog-pill';
    pill.id = `prog_pill_${member.id}`;
    pill.textContent = `${member.name}: ${member.cardIndex || 0}/${state.deck.length}`;
    container.appendChild(pill);
  });
}

// =========================================================
// Socket.io Real-Time Event Handlers
// =========================================================

socket.on('room:members_updated', (data) => {
  updateParticipantsList(data.members);
  updateProgressUI();
});

socket.on('session:started', (data) => {
  showToast('🍿 Swiping party has started!');
  startSwiperView(data.deck);
});

socket.on('match:found', (data) => {
  handleMatchFound(data);
});

socket.on('matches:updated', (data) => {
  state.matches = data.allMatches;
  updateMatchesDrawerUI();
  const badge = document.getElementById('matchesBadge');
  if (badge) badge.textContent = state.matches.length;
  const btnCount = document.getElementById('btnMatchCount');
  if (btnCount) btnCount.textContent = state.matches.length;
  const topBtnCount = document.getElementById('topBtnMatchCount');
  if (topBtnCount) topBtnCount.textContent = state.matches.length;
  const finBadge = document.getElementById('finishedMatchCount');
  if (finBadge) finBadge.textContent = state.matches.length;
});

socket.on('room:progress_updated', (data) => {
  data.members.forEach(m => {
    const pill = document.getElementById(`prog_pill_${m.id}`);
    if (pill) {
      pill.textContent = m.finished ? `${m.name}: Done ✓` : `${m.name}: ${m.progress}%`;
    }
  });
});

// Toast notification helper
function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function handleHomeClick(e) {
  if (e && e.preventDefault) e.preventDefault();

  const swiperVisible = document.getElementById('swiperView') && document.getElementById('swiperView').style.display !== 'none';
  const waitingVisible = document.getElementById('waitingRoom') && document.getElementById('waitingRoom').style.display !== 'none';

  // If actively swiping or in waiting room, confirm so user doesn't accidentally leave friends
  if (state.roomCode && (swiperVisible || waitingVisible)) {
    const confirmLeave = confirm('Leave this movie room and return to the home screen?');
    if (!confirmLeave) return;
  }

  // Clean navigation back to the root home page
  window.location.href = '/';
}
