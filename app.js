// ===================================================================
// MELODIA — USER PANEL JavaScript
// ===================================================================
const API_BASE_URL = 'https://melodia-backend-5f8g.onrender.com/api';

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyD_UjDhkU0QLu4TCkGszIItb-QL0WDzBZc",
  authDomain: "melodia-song.firebaseapp.com",
  projectId: "melodia-song",
  storageBucket: "melodia-song.firebasestorage.app",
  messagingSenderId: "171593594674",
  appId: "1:171593594674:web:0a02f78fe4f6febbcb892b"
};

let firebaseApp, firebaseAuth;
try {
  firebaseApp  = firebase.initializeApp(firebaseConfig);
  firebaseAuth = firebase.auth();
} catch (e) { console.warn('Firebase not configured:', e.message); }

// ===== SOCIAL AUTH =====
async function signInWithGoogle() {
  if (!firebaseAuth) return showToast('Firebase not configured.');
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email'); provider.addScope('profile');
    const result = await firebaseAuth.signInWithPopup(provider);
    await handleSocialAuthResult(result);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user')
      showAuthError('loginError', e.message || 'Google sign-in failed.');
  }
}

async function handleSocialAuthResult(result) {
  const fu = result.user;
  const name  = fu.displayName || fu.email?.split('@')[0] || 'User';
  const email = fu.email;
  const uid   = fu.uid;
  if (!email) { showAuthError('loginError', 'Could not get email. Please use email login.'); return; }
  try {
    const res = await fetch(`${API_BASE_URL}/auth/social-login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, firebaseUid: uid })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    currentUser = data.user;
    localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
    localStorage.setItem('rhythmToken', data.token);
    startApp();
  } catch {
    const users = JSON.parse(localStorage.getItem('rhythmUsers') || '[]');
    let user = users.find(u => u.email === email);
    if (!user) {
      user = { id: uid, name, email, password: uid, createdAt: new Date().toISOString() };
      users.push(user); localStorage.setItem('rhythmUsers', JSON.stringify(users));
    }
    currentUser = { name: user.name, email: user.email, id: user.id };
    localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
    startApp();
  }
}
// ===================================================================

let currentUser = null;
let allSongs = [];
let currentSongIndex = -1;
let currentQueue = [];
let isPlaying = false;
let likedSongs = [];
let playlists = [];
let currentDetailSongId = null;
let addToPlaylistSongId = null;
let currentOpenPlaylistId = null;
let isShuffle = false;
let loopMode = 'none';
let originalQueue = [];
let currentSection = 'home';

const audio = document.getElementById('audioPlayer');

// ===== INIT =====
window.onload = async () => {
  setGreeting();
  const saved = localStorage.getItem('rhythmUser');
  if (saved) { currentUser = JSON.parse(saved); startApp(); }
};

function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById('timeGreeting');
  if (el) el.textContent = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

// ===== AUTH =====
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('signupForm').classList.add('hidden');
  document.getElementById(tab + 'Form').classList.remove('hidden');
  event.target.classList.add('active');
}

async function loginUser() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showAuthError('loginError', 'Please fill all fields.');
  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) return showAuthError('loginError', data.message || 'Login failed.');
    currentUser = data.user;
    localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
    localStorage.setItem('rhythmToken', data.token);
    startApp();
  } catch {
    const users = JSON.parse(localStorage.getItem('rhythmUsers') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return showAuthError('loginError', 'Invalid credentials.');
    currentUser = { name: user.name, email: user.email, id: user.id };
    localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
    startApp();
  }
}

// Blocked temporary/disposable email domains
const BLOCKED_EMAIL_DOMAINS = [
  'mailinator.com','guerrillamail.com','tempmail.com','throwaway.email',
  'sharklasers.com','guerrillamailblock.com','grr.la','guerrillamail.info',
  'spam4.me','trashmail.com','trashmail.me','trashmail.net','trashmail.org',
  'dispostable.com','yopmail.com','yopmail.fr','yomail.info','cool.fr.nf',
  'jetable.fr.nf','nospam.ze.tc','nomail.xl.cx','mega.zik.dj','speed.1s.fr',
  'courriel.fr.nf','moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf',
  'maildrop.cc','mailnull.com','spamgourmet.com','spamgourmet.net',
  'fakeinbox.com','mailnesia.com','discard.email','spambox.us',
  'getairmail.com','filzmail.com','throwam.com','tempr.email',
  'dispostable.com','mailexpire.com','mailnull.com','spamhole.com',
  'binkmail.com','bobmail.info','chammy.info','devnullmail.com',
  'objectmail.com','ownmail.net','pecinan.com','proxymail.eu',
  'rklips.com','rmqkr.net','saint-mike.org','spamcon.org',
  'temporaryemail.net','temporaryinbox.com','tempinbox.co.uk',
  'tempinbox.com','thanksnospam.info','trbvm.com','turual.com',
  'uggsrock.com','venompen.com','voidbay.com','wetrainbayarea.org',
];

function isValidEmail(email) {
  // Basic format check
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return false;
  // Must have valid TLD (not just numbers)
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase();
  // Block disposable/temp mail domains
  if (BLOCKED_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return false;
  // Must have a real domain with TLD
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || /^[0-9]+$/.test(tld)) return false;
  return true;
}

async function registerUser() {
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  if (!name || !email || !password) return showAuthError('signupError', 'Please fill all fields.');
  if (!isValidEmail(email)) return showAuthError('signupError', 'Please enter a valid email address (e.g. name@gmail.com).');
  if (password.length < 6) return showAuthError('signupError', 'Password must be at least 6 characters.');
  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) return showAuthError('signupError', data.message || 'Sign up failed.');
    currentUser = data.user;
    localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
    localStorage.setItem('rhythmToken', data.token);
    startApp();
  } catch {
    const users = JSON.parse(localStorage.getItem('rhythmUsers') || '[]');
    if (users.find(u => u.email === email)) return showAuthError('signupError', 'Email already exists.');
    const newUser = { id: Date.now().toString(), name, email, password, createdAt: new Date().toISOString() };
    users.push(newUser); localStorage.setItem('rhythmUsers', JSON.stringify(users));
    currentUser = { name, email, id: newUser.id };
    localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
    startApp();
  }
}

function guestLogin() {
  currentUser = { name: 'Guest', email: '', id: 'guest', isGuest: true };
  startApp();
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem('rhythmUser');
  localStorage.removeItem('rhythmToken');
  location.reload();
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; setTimeout(() => el.textContent = '', 4000); }
}

// ===== SHOW PASSWORD TOGGLE =====
function togglePwd(inputId, checkbox) {
  const input = document.getElementById(inputId);
  if (input) input.type = checkbox.checked ? 'text' : 'password';
}
function togglePwdGroup(ids, checkbox) {
  ids.forEach(id => {
    const input = document.getElementById(id);
    if (input) input.type = checkbox.checked ? 'text' : 'password';
  });
}

// ===== START APP =====
async function startApp() {
  document.getElementById('authModal').classList.remove('active');
  document.getElementById('authModal').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  updateTopnavUser();
  await loadSongs();
  if (!currentUser.isGuest) {
    await loadLikedSongs();
    await loadPlaylists();
  }
  renderAllSongs();

  // Push initial home state to history
  history.replaceState({ section: 'home' }, '', '');

  // Restore last played song
  restoreLastPlayed();

  // Handle browser back button
  window.addEventListener('popstate', (e) => {
    const section = e.state?.section || 'home';
    // Close fullscreen player if open
    const fs = document.getElementById('npFullscreen');
    if (fs && !fs.classList.contains('hidden')) {
      closeNowPlayingScreen();
      history.pushState({ section: currentSection }, '', '');
      return;
    }
    // If already on home, let browser exit normally
    if (section === 'home') {
      showSectionInternal('home');
    } else {
      showSectionInternal(section);
    }
  });
}

function restoreLastPlayed() {
  try {
    const saved = localStorage.getItem('melodiaLastPlayed');
    if (!saved) return;
    const { songId, time } = JSON.parse(saved);
    const song = allSongs.find(s => s._id === songId);
    if (!song) return;
    currentQueue = [...allSongs];
    currentSongIndex = currentQueue.findIndex(s => s._id === songId);
    if (currentSongIndex === -1) return;
    // Use global audio variable — do NOT redeclare with const
    audio.src = song.audioUrl || '';
    audio.currentTime = time || 0;
    audio.pause();
    isPlaying = false;
    updateNowPlayingUI(song);
    updateFsPlayPauseIcon();
  } catch (e) {
    console.log('Could not restore last played:', e.message);
  }
}
function updateTopnavUser() {
  const avatarEl = document.getElementById('topnavAvatar');
  const usernameEl = document.getElementById('topnavUsername');
  if (avatarEl) avatarEl.textContent = currentUser.isGuest ? '👤' : currentUser.name[0].toUpperCase();
  if (usernameEl) usernameEl.textContent = currentUser.isGuest ? 'Guest' : currentUser.name;
}

function authHeaders() {
  const token = localStorage.getItem('rhythmToken');
  return { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
}

// ===== SONGS =====
async function loadSongs() {
  try {
    const res = await fetch(`${API_BASE_URL}/songs`);
    const data = await res.json();
    allSongs = (data.songs || data || []).map(s => ({ ...s, cast: s.cast || s.cast_members || '' }));
  } catch {
    const raw = JSON.parse(localStorage.getItem('rhythmSongs') || '[]');
    allSongs = raw.map(s => ({ ...s, cast: s.cast || s.cast_members || '' }));
    if (!allSongs.length) allSongs = getDemoSongs();
  }
  currentQueue = [...allSongs];
}

function getDemoSongs() {
  return [
    { _id: '1', songName: 'Kesariya', movieName: 'Brahmastra', singer: 'Arijit Singh', musicDirector: 'Pritam', movieDirector: 'Ayan Mukerji', label: 'Sony Music', genre: 'Amitabh Bhattacharya', year: 2022, coverUrl: '', audioUrl: '' },
    { _id: '2', songName: 'Tum Hi Ho', movieName: 'Aashiqui 2', singer: 'Arijit Singh', musicDirector: 'Mithoon', movieDirector: 'Mohit Suri', label: 'T-Series', genre: 'Mithoon', year: 2013, coverUrl: '', audioUrl: '' },
    { _id: '3', songName: 'Raatan Lambiyan', movieName: 'Shershaah', singer: 'Jubin Nautiyal, Asees Kaur', musicDirector: 'Tanishk Bagchi', movieDirector: 'Vishnuvardhan', label: 'Sony Music', genre: 'Anvita Dutt', year: 2021, coverUrl: '', audioUrl: '' },
    { _id: '4', songName: 'Pushpa Pushpa', movieName: 'Pushpa 2', singer: 'Nakash Aziz', musicDirector: 'Devi Sri Prasad', movieDirector: 'Sukumar', label: 'T-Series', genre: 'Chandrabose', year: 2024, coverUrl: '', audioUrl: '' },
  ];
}

// ===== RENDER GRID =====
function renderAllSongs() { renderSongsGrid(allSongs, 'allSongsGrid'); }

function renderSongsGrid(songs, containerId) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  if (!songs.length) { grid.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:20px 0;">No songs found.</div>'; return; }
  grid.innerHTML = songs.map(song => `
    <div class="song-card"
      onclick="playSong('${song._id}')"
      oncontextmenu="openContextMenu(event,'${song._id}')"
      data-song-id="${song._id}">
      ${song.coverUrl ? `<img class="song-card-cover" src="${song.coverUrl}" alt="${esc(song.songName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />` : ''}
      <div class="song-card-cover-placeholder" style="${song.coverUrl ? 'display:none' : ''}">🎵</div>
      <div class="song-card-play-overlay">
        <button class="song-card-play-btn" onclick="event.stopPropagation();playSong('${song._id}')">▶</button>
      </div>
      <div class="song-card-info">
        <div class="song-card-title">${esc(song.songName)}</div>
        <div class="song-card-artist">${esc(song.musicDirector || song.singer)}</div>
      </div>
    </div>`
  ).join('');
  // Add long-press for mobile
  grid.querySelectorAll('.song-card').forEach(card => {
    addLongPress(card, () => {
      const id = card.getAttribute('data-song-id');
      openContextMenu(null, id, card);
    });
  });
}

function renderSongsList(songs, containerId, showRemove = false, playlistId = null) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!songs.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:20px 0;">No songs here yet.</div>'; return; }
  el.innerHTML = songs.map((song, i) => `
    <div class="song-list-item ${currentQueue[currentSongIndex]?._id === song._id ? 'playing' : ''}"
      onclick="playSongFromList(${i}, '${containerId}')"
      oncontextmenu="openContextMenu(event,'${song._id}')"
      data-song-id="${song._id}">
      ${song.coverUrl ? `<img class="song-list-cover" src="${song.coverUrl}" alt="" onerror="this.outerHTML='<div class=song-list-cover-ph>🎵</div>'" />` : `<div class="song-list-cover-ph">🎵</div>`}
      <div class="song-list-meta">
        <div class="song-list-title">${esc(song.songName)}</div>
        <div class="song-list-artist">${esc(song.musicDirector || song.singer)} • ${esc(song.movieName)}</div>
      </div>
      ${showRemove ? `<button class="card-action-btn" title="Remove" onclick="event.stopPropagation();removeSongFromPlaylist('${playlistId}','${song._id}')">🗑️</button>` : ''}
    </div>`
  ).join('');
  el._songsList = songs;
  // Add long-press for mobile
  el.querySelectorAll('.song-list-item').forEach(item => {
    addLongPress(item, () => {
      const id = item.getAttribute('data-song-id');
      openContextMenu(null, id, item);
    });
  });
}

// ===== CONTEXT MENU =====
let ctxSongId = null;
let longPressTimer = null;
let pctxPlaylistId = null;

function openContextMenu(e, songId, anchorEl) {
  if (e) e.preventDefault();
  ctxSongId = songId;
  const song = allSongs.find(s => s._id === songId);
  if (!song) return;

  // Populate header
  document.getElementById('ctxCover').src = song.coverUrl || '';
  document.getElementById('ctxCover').style.display = song.coverUrl ? 'block' : 'none';
  document.getElementById('ctxTitle').textContent = song.songName;
  document.getElementById('ctxArtist').textContent = song.musicDirector || song.singer || '';
  document.getElementById('ctxLikeText').textContent = isLiked(songId) ? 'Remove from Liked Songs' : 'Add to Liked Songs';
  document.getElementById('ctxLikeBtn').style.color = isLiked(songId) ? 'var(--accent)' : '';

  const menu = document.getElementById('songContextMenu');
  const backdrop = document.getElementById('ctxBackdrop');
  menu.classList.remove('hidden');
  backdrop.classList.remove('hidden');

  // Position menu
  if (e) {
    // Desktop right-click — position at cursor
    const menuW = 240, menuH = 320;
    let x = e.clientX, y = e.clientY;
    if (x + menuW > window.innerWidth)  x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.style.bottom = 'auto';
    menu.style.transform = 'none';
  } else {
    // Mobile long press — slide up from bottom
    menu.style.left = '0';
    menu.style.right = '0';
    menu.style.bottom = '0';
    menu.style.top = 'auto';
    menu.style.transform = 'none';
    menu.style.borderRadius = '20px 20px 0 0';
    menu.style.width = '100%';
    menu.style.maxWidth = '100%';
  }
}

function closeContextMenu() {
  document.getElementById('songContextMenu')?.classList.add('hidden');
  document.getElementById('playlistContextMenu')?.classList.add('hidden');
  document.getElementById('ctxBackdrop')?.classList.add('hidden');
  ctxSongId = null;
  pctxPlaylistId = null;
}

function ctxPlay()         { if (ctxSongId) { playSong(ctxSongId); closeContextMenu(); } }
function ctxPlayNext()     { if (ctxSongId) { playNext(ctxSongId); closeContextMenu(); } }
function ctxAddToQueue()   { if (ctxSongId) { addToQueue(ctxSongId); closeContextMenu(); } }
function ctxAddToPlaylist(){ if (ctxSongId) { openAddToPlaylist(ctxSongId); closeContextMenu(); } }
function ctxToggleLike()   {
  if (ctxSongId) {
    toggleLike(ctxSongId);
    document.getElementById('ctxLikeText').textContent = isLiked(ctxSongId) ? 'Remove from Liked Songs' : 'Add to Liked Songs';
    document.getElementById('ctxLikeBtn').style.color = isLiked(ctxSongId) ? 'var(--accent)' : '';
  }
}
function ctxViewCredits()  { if (ctxSongId) { openSongDetail(ctxSongId); closeContextMenu(); } }

// Play Next — insert right after current song
function playNext(id) {
  if (requireLogin()) return;
  const song = allSongs.find(s => s._id === id);
  if (!song) return;
  if (currentSongIndex === -1) { currentQueue = [song]; currentSongIndex = 0; loadAndPlay(); return; }
  currentQueue.splice(currentSongIndex + 1, 0, song);
  renderQueue();
  showToast(`"${song.songName}" will play next!`);
}

// Long press helper for mobile
function addLongPress(el, callback) {
  let timer = null;
  let moved = false;

  el.addEventListener('touchstart', (e) => {
    moved = false;
    timer = setTimeout(() => {
      if (!moved) {
        callback();
        // Vibrate if supported
        if (navigator.vibrate) navigator.vibrate(40);
      }
    }, 500);
  }, { passive: true });

  el.addEventListener('touchmove', () => { moved = true; clearTimeout(timer); }, { passive: true });
  el.addEventListener('touchend', () => clearTimeout(timer), { passive: true });
  el.addEventListener('touchcancel', () => clearTimeout(timer), { passive: true });
}

// Close context menu on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeContextMenu();
});
function requireLogin() {
  if (currentUser?.isGuest) { showLoginPrompt(); return true; }
  return false;
}
function showLoginPrompt() {
  document.getElementById('authModal').classList.remove('hidden');
  document.getElementById('authModal').classList.add('active');
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('signupForm').classList.add('hidden');
  document.querySelectorAll('.auth-tab')[0]?.classList.add('active');
  const err = document.getElementById('loginError');
  if (err) { err.textContent = '🎵 Please login or sign up to listen to songs!'; err.style.color = '#ff3f6c'; }
}

// ===== PLAY =====
function playSong(id) {
  if (requireLogin()) return;
  const idx = allSongs.findIndex(s => s._id === id);
  if (idx === -1) return;
  currentQueue = [...allSongs]; currentSongIndex = idx; loadAndPlay();
}
function playSongFromList(idx, containerId) {
  if (requireLogin()) return;
  const el = document.getElementById(containerId);
  if (!el || !el._songsList) return;
  currentQueue = [...el._songsList]; currentSongIndex = idx; loadAndPlay();
}
function loadAndPlay() {
  const song = currentQueue[currentSongIndex];
  if (!song) return;
  audio.src = song.audioUrl || '';
  audio.loop = loopMode === 'single';
  audio.play().catch(() => {});
  isPlaying = true;
  updateNowPlayingUI(song);
  renderQueue();
  // Save last played to localStorage
  try {
    localStorage.setItem('melodiaLastPlayed', JSON.stringify({ songId: song._id, time: 0 }));
  } catch(e) {}
}

function togglePlayPause() {
  if (requireLogin()) return;
  if (!currentQueue[currentSongIndex]) return;
  if (isPlaying) { audio.pause(); isPlaying = false; }
  else           { audio.play();  isPlaying = true;  }
  updateFsPlayPauseIcon();
}
function prevSong() { if (requireLogin()) return; if (currentSongIndex > 0) { currentSongIndex--; loadAndPlay(); } }
function nextSong() {
  if (requireLogin()) return;
  if (loopMode === 'single') { audio.currentTime = 0; audio.play(); return; }
  if (isShuffle) { currentSongIndex = Math.floor(Math.random() * currentQueue.length); loadAndPlay(); return; }
  if (currentSongIndex < currentQueue.length - 1) { currentSongIndex++; loadAndPlay(); }
  else if (loopMode === 'playlist') { currentSongIndex = 0; loadAndPlay(); }
}
function seekSong(e) { if (!audio.duration) return; audio.currentTime = (e.offsetX / e.currentTarget.offsetWidth) * audio.duration; }
function setVolume(v) { audio.volume = v; }

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  document.getElementById('progressFill').style.width = (audio.currentTime / audio.duration * 100) + '%';
  document.getElementById('currentTime').textContent = fmtTime(audio.currentTime);
  document.getElementById('totalTime').textContent = fmtTime(audio.duration);
  updateFsProgress();
});
audio.addEventListener('ended', () => { if (loopMode === 'single') { audio.currentTime = 0; audio.play(); return; } nextSong(); });
audio.addEventListener('play',  () => { isPlaying = true;  updateFsPlayPauseIcon(); });
audio.addEventListener('pause', () => { isPlaying = false; updateFsPlayPauseIcon(); });
audio.addEventListener('timeupdate', () => {
  // Save current time every 5 seconds
  if (Math.floor(audio.currentTime) % 5 === 0 && currentQueue[currentSongIndex]) {
    try {
      localStorage.setItem('melodiaLastPlayed', JSON.stringify({
        songId: currentQueue[currentSongIndex]._id,
        time: Math.floor(audio.currentTime)
      }));
    } catch(e) {}
  }
});

function updateNowPlayingUI(song) {
  // Mini bar
  document.getElementById('npTitle').textContent = song.songName;
  const musicDir = song.musicDirector || song.singer || '—';
  document.getElementById('npArtist').textContent = musicDir;
  const cover = document.getElementById('npCover');
  cover.src = song.coverUrl || ''; cover.style.display = song.coverUrl ? 'block' : 'none';

  // Like button sync
  const likeEmoji = isLiked(song._id) ? '❤️' : '🤍';
  const npLike = document.getElementById('npLikeBtn');
  if (npLike) npLike.textContent = likeEmoji;

  // Fullscreen
  // Song title — apply scroll animation if text is long
  const titleEl = document.getElementById('npfsTitle');
  titleEl.classList.remove('npfs-title-scroll');
  // Use doubled text inside a span for infinite marquee scroll
  titleEl.innerHTML = `<span class="npfs-title-inner">${esc(song.songName)}</span>`;
  // Measure after render
  requestAnimationFrame(() => {
    const inner = titleEl.querySelector('.npfs-title-inner');
    if (inner && inner.scrollWidth > titleEl.clientWidth + 4) {
      // Double the text for seamless loop
      inner.textContent = song.songName + '          ' + song.songName;
      titleEl.classList.add('npfs-title-scroll');
    }
  });

  const fsCover = document.getElementById('npfsCover');
  const fsCoverPh = document.getElementById('npfsCoverPh');
  if (song.coverUrl) {
    fsCover.src = song.coverUrl;
    fsCover.style.display = 'block';
    fsCoverPh.style.display = 'none';
  } else {
    fsCover.style.display = 'none';
    fsCoverPh.style.display = 'flex';
  }

  // Marquee: Music Director + Singers
  const parts = [];
  if (song.musicDirector) parts.push(`🎼 ${song.musicDirector}`);
  if (song.singer)        parts.push(`🎤 ${song.singer}`);
  const marqueeText = parts.length ? parts.join('   •   ') : '—';
  const doubled = `${marqueeText}          ${marqueeText}`;
  document.getElementById('npfsMarquee').textContent = doubled;

  document.getElementById('npfsLikeBtn').textContent = likeEmoji;

  // Lyrics
  const lyricsEl = document.getElementById('npfsLyrics');
  const lyricsWrap = document.getElementById('npfsLyricsWrap');
  if (song.lyrics && song.lyrics.trim()) {
    lyricsEl.textContent = song.lyrics;
    lyricsWrap.style.display = 'block';
  } else {
    lyricsWrap.style.display = 'none';
  }

  updateFsPlayPauseIcon();
  const fs = document.getElementById('npFullscreen');
  if (fs) fs.style.background = '#0a0a0f';

  // Update desktop lyrics panel if open
  const lyricsPanel = document.getElementById('lyricsPanel');
  if (lyricsPanel && !lyricsPanel.classList.contains('hidden')) {
    updateLyricsPanel();
  }
}

// ===== FULLSCREEN NOW PLAYING =====
function openQueueFromFullscreen() {
  closeNowPlayingScreen();
  setTimeout(() => { toggleQueue(); }, 320); // wait for close animation
}

function openNowPlayingScreen() {
  const song = currentQueue[currentSongIndex];
  if (!song) return;
  const fs = document.getElementById('npFullscreen');
  fs.classList.remove('hidden');
  fs.classList.remove('npfs-closing');
  document.body.style.overflow = 'hidden';
  updateFsProgress();
  history.pushState({ section: currentSection, fullscreen: true }, '', '');

  // Swipe down to close gesture
  let startY = 0, isDragging = false;
  fs._swipeHandler = (e) => { startY = e.touches[0].clientY; isDragging = true; };
  fs._swipeMoveHandler = (e) => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) fs.style.transform = `translateY(${Math.min(dy, 200)}px)`;
  };
  fs._swipeEndHandler = (e) => {
    isDragging = false;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) {
      fs.style.transform = '';
      closeNowPlayingScreen();
    } else {
      fs.style.transform = '';
    }
  };
  fs.addEventListener('touchstart', fs._swipeHandler, { passive: true });
  fs.addEventListener('touchmove', fs._swipeMoveHandler, { passive: true });
  fs.addEventListener('touchend', fs._swipeEndHandler, { passive: true });
}

function closeNowPlayingScreen() {
  const fs = document.getElementById('npFullscreen');
  fs.style.transform = '';
  fs.classList.add('npfs-closing');
  // Remove swipe listeners
  if (fs._swipeHandler)     fs.removeEventListener('touchstart', fs._swipeHandler);
  if (fs._swipeMoveHandler) fs.removeEventListener('touchmove', fs._swipeMoveHandler);
  if (fs._swipeEndHandler)  fs.removeEventListener('touchend', fs._swipeEndHandler);
  setTimeout(() => {
    fs.classList.add('hidden');
    fs.classList.remove('npfs-closing');
    document.body.style.overflow = '';
  }, 300);
}

function updateFsPlayPauseIcon() {
  // Fullscreen
  document.getElementById('npfsPlayIcon')?.classList.toggle('hidden', isPlaying);
  document.getElementById('npfsPauseIcon')?.classList.toggle('hidden', !isPlaying);
  // Mobile mini bar
  document.getElementById('mobPlayIcon')?.classList.toggle('hidden', isPlaying);
  document.getElementById('mobPauseIcon')?.classList.toggle('hidden', !isPlaying);
  // Desktop bar
  document.getElementById('desktopPlayIcon')?.classList.toggle('hidden', isPlaying);
  document.getElementById('desktopPauseIcon')?.classList.toggle('hidden', !isPlaying);

  // Sync fullscreen shuffle/loop active states
  const fsLoopBtn   = document.getElementById('npfsLoopBtn');
  const fsLoopBadge = document.getElementById('npfsLoopBadge');
  if (fsLoopBtn)   fsLoopBtn.classList.toggle('active', loopMode !== 'none');
  if (fsLoopBadge) fsLoopBadge.classList.toggle('hidden', loopMode !== 'single');
  // Desktop loop
  const loopBtn   = document.getElementById('loopBtn');
  const loopBadge = document.getElementById('loopBadge');
  if (loopBtn)   loopBtn.classList.toggle('active', loopMode !== 'none');
  if (loopBadge) loopBadge.classList.toggle('hidden', loopMode !== 'single');
  // Desktop queue active
  const qDesktop = document.getElementById('queueDesktopBtn');
  if (qDesktop) {
    const qPanel = document.getElementById('queuePanel');
    qDesktop.classList.toggle('active', qPanel && !qPanel.classList.contains('hidden'));
  }
}

function updateFsProgress() {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  const fill  = document.getElementById('npfsProgressFill');
  const thumb = document.getElementById('npfsProgressThumb');
  if (fill)  fill.style.width  = pct + '%';
  if (thumb) thumb.style.left  = pct + '%';
  document.getElementById('npfsCurrentTime').textContent = fmtTime(audio.currentTime);
  document.getElementById('npfsTotalTime').textContent   = fmtTime(audio.duration);
}
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// ===== SHUFFLE =====
function toggleShuffle() {
  isShuffle = !isShuffle;
  document.getElementById('shuffleBtn').classList.toggle('active', isShuffle);
  if (isShuffle) {
    originalQueue = [...currentQueue];
    const current = currentQueue[currentSongIndex];
    const rest = currentQueue.filter((_, i) => i !== currentSongIndex);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    currentQueue = [current, ...rest]; currentSongIndex = 0;
  } else {
    if (originalQueue.length) {
      const current = currentQueue[currentSongIndex];
      currentQueue = [...originalQueue];
      currentSongIndex = currentQueue.findIndex(s => s._id === current._id);
      if (currentSongIndex === -1) currentSongIndex = 0;
    }
  }
  renderQueue(); showToast(isShuffle ? '🔀 Shuffle On' : '🔀 Shuffle Off');
}

// ===== LOOP =====
function cycleLoop() {
  if (loopMode === 'none') loopMode = 'playlist';
  else if (loopMode === 'playlist') loopMode = 'single';
  else loopMode = 'none';
  updateLoopUI();
  const msgs = { none: '🔁 Loop Off', playlist: '🔁 Playlist Loop On', single: '🔂 Single Loop On' };
  showToast(msgs[loopMode]);
}
function updateLoopUI() {
  const btn = document.getElementById('loopBtn');
  const badge = document.getElementById('loopBadge');
  btn.classList.toggle('active', loopMode !== 'none');
  if (badge) badge.classList.toggle('hidden', loopMode !== 'single');
  audio.loop = loopMode === 'single';
}

// ===== ADD TO QUEUE =====
function addToQueue(id) {
  if (requireLogin()) return;
  const song = allSongs.find(s => s._id === id);
  if (!song) return;
  // If nothing playing, start playing
  if (currentSongIndex === -1) { currentQueue = [song]; currentSongIndex = 0; loadAndPlay(); return; }
  // Check if already in queue (upcoming songs only)
  const alreadyInQueue = currentQueue.slice(currentSongIndex + 1).some(s => s._id === id);
  if (alreadyInQueue) { showToast(`"${song.songName}" is already in queue!`); return; }
  currentQueue.splice(currentSongIndex + 1, 0, song);
  renderQueue(); showToast(`"${song.songName}" added to queue!`);
}

// ===== DESKTOP LYRICS PANEL =====
function toggleLyricsPanel() {
  const panel = document.getElementById('lyricsPanel');
  const btn   = document.getElementById('lyricsBtn');
  const isOpen = !panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  btn?.classList.toggle('active', !isOpen);
  // Close queue if lyrics opens (avoid overlap)
  if (!isOpen) {
    document.getElementById('queuePanel')?.classList.add('hidden');
    document.getElementById('queueBtn')?.classList.remove('active');
    updateLyricsPanel();
  }
}

function updateLyricsPanel() {
  const song = currentQueue[currentSongIndex];
  const titleEl  = document.getElementById('lyricsPanelTitle');
  const artistEl = document.getElementById('lyricsPanelArtist');
  const textEl   = document.getElementById('lyricsPanelText');
  const emptyEl  = document.getElementById('lyricsPanelEmpty');
  if (!song) {
    if (titleEl)  titleEl.textContent  = '—';
    if (artistEl) artistEl.textContent = '—';
    if (textEl)   textEl.textContent   = '';
    if (emptyEl)  emptyEl.style.display = 'flex';
    return;
  }
  if (titleEl)  titleEl.textContent  = song.songName;
  if (artistEl) artistEl.textContent = song.musicDirector || song.singer || '—';
  if (song.lyrics && song.lyrics.trim()) {
    if (textEl)  { textEl.textContent = song.lyrics; textEl.style.display = 'block'; }
    if (emptyEl) emptyEl.style.display = 'none';
  } else {
    if (textEl)  { textEl.textContent = ''; textEl.style.display = 'none'; }
    if (emptyEl) emptyEl.style.display = 'flex';
  }
}

// ===== QUEUE PANEL =====
function toggleQueue() {
  const panel = document.getElementById('queuePanel');
  const isOpen = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  // Sync active state on both possible queue buttons
  ['queueBtn','queueDesktopBtn'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', isOpen);
  });
  if (isOpen) renderQueue();
}
function renderQueue() {
  const nowEl = document.getElementById('queueNowPlaying');
  const listEl = document.getElementById('queueList');
  if (!nowEl || !listEl) return;
  const current = currentQueue[currentSongIndex];
  nowEl.innerHTML = current ? queueItemHTML(current, -1, true) : '<div style="color:var(--text-muted);font-size:13px;padding:8px;">Nothing playing</div>';
  const upcoming = currentQueue.slice(currentSongIndex + 1);
  listEl.innerHTML = upcoming.length
    ? upcoming.map((s, i) => queueItemHTML(s, currentSongIndex + 1 + i, false)).join('')
    : '<div style="color:var(--text-muted);font-size:13px;padding:8px;">No songs in queue</div>';
}

function queueItemHTML(song, idx, isNow) {
  return `<div class="queue-item ${isNow ? 'playing-now' : ''}" onclick="${isNow ? '' : `jumpToQueue(${idx})`}">
    ${song.coverUrl ? `<img class="queue-cover" src="${song.coverUrl}" alt="" />` : `<div class="queue-cover-ph">🎵</div>`}
    <div class="queue-meta">
      <div class="queue-title">${esc(song.songName)}</div>
      <div class="queue-artist">${esc(song.singer || '')}</div>
    </div>
    ${isNow
      ? '<span style="color:var(--accent);font-size:11px;flex-shrink:0;">▶ Now</span>'
      : `<button class="queue-remove-btn" onclick="event.stopPropagation(); removeFromQueue(${idx})" title="Remove">✕</button>`
    }
  </div>`;
}

function removeFromQueue(idx) {
  currentQueue.splice(idx, 1);
  // Adjust currentSongIndex if needed
  if (idx < currentSongIndex) currentSongIndex--;
  renderQueue();
}

function jumpToQueue(idx) { currentSongIndex = idx; loadAndPlay(); renderQueue(); }

// ===== LIKED SONGS =====
async function loadLikedSongs() {
  try {
    const res = await fetch(`${API_BASE_URL}/users/${currentUser.id}/liked`, { headers: authHeaders() });
    likedSongs = (await res.json()).likedSongs || [];
  } catch { likedSongs = JSON.parse(localStorage.getItem(`liked_${currentUser.id}`) || '[]'); }
}
async function saveLikedSongs() {
  try {
    await fetch(`${API_BASE_URL}/users/${currentUser.id}/liked`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ likedSongs }) });
  } catch { localStorage.setItem(`liked_${currentUser.id}`, JSON.stringify(likedSongs)); }
}
function isLiked(id) { return likedSongs.includes(id); }
async function toggleLike(id) {
  if (currentUser?.isGuest) return showToast('Please login to like songs!');
  if (isLiked(id)) likedSongs = likedSongs.filter(i => i !== id); else likedSongs.push(id);
  await saveLikedSongs();
  const liked = isLiked(id);
  const emoji = liked ? '❤️' : '🤍';
  // Update all song card like buttons
  document.querySelectorAll(`[id="likeBtn-${id}"]`).forEach(btn => {
    btn.textContent = emoji; btn.classList.toggle('liked', liked);
  });
  // Sync mini bar like button
  const miniLike = document.getElementById('npLikeBtn');
  if (miniLike && currentQueue[currentSongIndex]?._id === id) miniLike.textContent = emoji;
  // Sync fullscreen like button
  const fsLike = document.getElementById('npfsLikeBtn');
  if (fsLike && currentQueue[currentSongIndex]?._id === id) fsLike.textContent = emoji;
  renderLikedSection();
}
function toggleLikeCurrent() { const s = currentQueue[currentSongIndex]; if (s) toggleLike(s._id); }
function renderLikedSection() {
  const songs = allSongs.filter(s => likedSongs.includes(s._id));
  document.getElementById('likedCount').textContent = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
  renderSongsList(songs, 'likedSongsList');
}
function confirmClearLiked() {
  if (currentUser?.isGuest) return showToast('Please login first!');
  openConfirm('🗑️ Clear All Liked Songs', 'This will remove all songs from your Liked Songs. This cannot be undone.',
    async () => { likedSongs = []; await saveLikedSongs(); renderLikedSection(); renderAllSongs(); showToast('Liked songs cleared.'); });
}

// ===== PLAYLISTS =====
async function loadPlaylists() {
  try {
    const res = await fetch(`${API_BASE_URL}/users/${currentUser.id}/playlists`, { headers: authHeaders() });
    playlists = (await res.json()).playlists || [];
  } catch { playlists = JSON.parse(localStorage.getItem(`playlists_${currentUser.id}`) || '[]'); }
}
async function savePlaylists() {
  try {
    await fetch(`${API_BASE_URL}/users/${currentUser.id}/playlists`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ playlists }) });
  } catch { localStorage.setItem(`playlists_${currentUser.id}`, JSON.stringify(playlists)); }
}
function renderPlaylistsSection() {
  const grid = document.getElementById('playlistsGrid');
  if (!grid) return;
  if (!playlists.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:14px;">No playlists yet. Create one!</div>';
    return;
  }
  grid.innerHTML = playlists.map(p => `
    <div class="playlist-card"
      onclick="openPlaylistDetail('${p.id}')"
      oncontextmenu="openPlaylistContextMenu(event,'${p.id}')"
      data-playlist-id="${p.id}">
      <div class="playlist-card-art">📂</div>
      <div class="playlist-card-name">${esc(p.name)}</div>
      <div class="playlist-card-count">${p.songs.length} song${p.songs.length !== 1 ? 's' : ''}</div>
    </div>`).join('');

  // Add long-press for mobile
  grid.querySelectorAll('.playlist-card').forEach(card => {
    addLongPress(card, () => {
      const id = card.getAttribute('data-playlist-id');
      openPlaylistContextMenu(null, id, card);
    });
  });
}
function openCreatePlaylist() {
  if (currentUser?.isGuest) return showToast('Please login to create playlists!');
  document.getElementById('createPlaylistModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('newPlaylistName').focus(), 100);
}
function closeCreatePlaylist() { document.getElementById('createPlaylistModal').classList.add('hidden'); document.getElementById('newPlaylistName').value = ''; }
async function createPlaylist() {
  const name = document.getElementById('newPlaylistName').value.trim();
  if (!name) return;
  playlists.push({ id: Date.now().toString(), name, songs: [], createdAt: new Date().toISOString() });
  await savePlaylists(); closeCreatePlaylist(); renderPlaylistsSection(); showToast(`Playlist "${name}" created!`);
}
let renameTargetId = null;
function openRenamePlaylist() { openRenamePlaylistById(currentOpenPlaylistId); }
function openRenamePlaylistById(id) {
  const pl = playlists.find(p => p.id === id); if (!pl) return;
  renameTargetId = id;
  document.getElementById('renamePlaylistInput').value = pl.name;
  document.getElementById('renamePlaylistModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('renamePlaylistInput').focus(), 100);
}
function closeRenamePlaylist() { document.getElementById('renamePlaylistModal').classList.add('hidden'); renameTargetId = null; }
async function saveRenamePlaylist() {
  const newName = document.getElementById('renamePlaylistInput').value.trim();
  if (!newName || !renameTargetId) return;
  const pl = playlists.find(p => p.id === renameTargetId); if (!pl) return;
  pl.name = newName; await savePlaylists(); closeRenamePlaylist(); renderPlaylistsSection();
  if (currentOpenPlaylistId === renameTargetId) document.getElementById('playlistDetailName').textContent = `📂 ${newName}`;
  showToast(`Renamed to "${newName}"`);
}
function confirmDeletePlaylist(id) {
  const pl = playlists.find(p => p.id === id);
  if (!pl) return;
  openConfirm(
    '🗑️ Delete Playlist',
    `Delete "${pl.name}"? This cannot be undone.`,
    async () => {
      playlists = playlists.filter(p => p.id !== id);
      await savePlaylists();
      renderPlaylistsSection();
      if (currentOpenPlaylistId === id) closePlaylistDetail();
      showToast(`Playlist "${pl.name}" deleted.`);
    }
  );
}

// ===== PLAYLIST CONTEXT MENU =====
function openPlaylistContextMenu(e, id, anchorEl) {
  if (e) e.preventDefault();
  pctxPlaylistId = id;
  const pl = playlists.find(p => p.id === id);
  if (!pl) return;

  document.getElementById('pctxTitle').textContent = pl.name;
  document.getElementById('pctxCount').textContent = `${pl.songs.length} song${pl.songs.length !== 1 ? 's' : ''}`;

  const menu   = document.getElementById('playlistContextMenu');
  const backdrop = document.getElementById('ctxBackdrop');
  // Close song context menu if open
  document.getElementById('songContextMenu')?.classList.add('hidden');
  menu.classList.remove('hidden');
  backdrop.classList.remove('hidden');

  if (e) {
    // Desktop right-click
    const menuW = 240, menuH = 180;
    let x = e.clientX, y = e.clientY;
    if (x + menuW > window.innerWidth)  x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.style.bottom = 'auto';
    menu.style.transform = 'none';
    menu.style.borderRadius = '14px';
    menu.style.width = '240px';
  } else {
    // Mobile long press — slide up from bottom
    menu.style.left = '0';
    menu.style.right = '0';
    menu.style.bottom = '0';
    menu.style.top = 'auto';
    menu.style.width = '100%';
    menu.style.maxWidth = '100%';
    menu.style.borderRadius = '20px 20px 0 0';
  }
}

function closePlaylistContextMenu() {
  document.getElementById('playlistContextMenu')?.classList.add('hidden');
  pctxPlaylistId = null;
}

function pctxRename() {
  const id = pctxPlaylistId;
  closePlaylistContextMenu();
  closeContextMenu();
  if (id) openRenamePlaylistById(id);
}
function pctxDelete() {
  const id = pctxPlaylistId;
  closePlaylistContextMenu();
  closeContextMenu();
  if (id) confirmDeletePlaylist(id);
}
function deleteCurrentPlaylist() { if (currentOpenPlaylistId) confirmDeletePlaylist(currentOpenPlaylistId); }
function openPlaylistDetail(id) {
  currentOpenPlaylistId = id;
  const pl = playlists.find(p => p.id === id); if (!pl) return;
  const songs = allSongs.filter(s => pl.songs.includes(s._id));
  document.getElementById('playlistDetailName').textContent = `📂 ${pl.name}`;
  document.getElementById('playlistDetailCount').textContent = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
  document.getElementById('playlistSongSearch').value = '';
  document.getElementById('playlistAddResults').classList.add('hidden');
  renderSongsList(songs, 'playlistDetailSongs', true, id);
  document.getElementById('playlistsGrid').classList.add('hidden');
  document.getElementById('playlistDetail').classList.remove('hidden');
}
function closePlaylistDetail() {
  document.getElementById('playlistDetail').classList.add('hidden');
  document.getElementById('playlistsGrid').classList.remove('hidden');
  document.getElementById('playlistAddResults').classList.add('hidden');
  document.getElementById('playlistSongSearch').value = '';
  currentOpenPlaylistId = null;
}
function searchSongsToAdd(query) {
  const resultsEl = document.getElementById('playlistAddResults');
  if (!query.trim()) { resultsEl.classList.add('hidden'); return; }
  const pl = playlists.find(p => p.id === currentOpenPlaylistId);
  const results = allSongs.filter(s =>
    s.songName?.toLowerCase().includes(query.toLowerCase()) ||
    s.singer?.toLowerCase().includes(query.toLowerCase()) ||
    s.movieName?.toLowerCase().includes(query.toLowerCase()) ||
    s.cast?.toLowerCase().includes(query.toLowerCase()) ||
    s.musicDirector?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);
  if (!results.length) { resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:10px;">No songs found.</div>'; resultsEl.classList.remove('hidden'); return; }
  resultsEl.innerHTML = results.map(s => {
    const inPl = pl?.songs.includes(s._id);
    return `<div class="playlist-add-item">
      <div class="playlist-add-item-info">
        ${s.coverUrl ? `<img src="${s.coverUrl}" alt="" />` : '<div style="width:38px;height:38px;border-radius:6px;background:var(--surface2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">🎵</div>'}
        <div><div class="playlist-add-item-name">${esc(s.songName)}</div><div class="playlist-add-item-sub">${esc(s.singer)}</div></div>
      </div>
      <button class="add-song-btn ${inPl ? 'added' : ''}" ${inPl ? 'disabled' : `onclick="addSongToCurrentPlaylist('${s._id}')"`}>${inPl ? '✓ Added' : '+ Add'}</button>
    </div>`;
  }).join('');
  resultsEl.classList.remove('hidden');
}
async function addSongToCurrentPlaylist(songId) {
  if (!currentOpenPlaylistId) return;
  const pl = playlists.find(p => p.id === currentOpenPlaylistId);
  if (!pl || pl.songs.includes(songId)) return;
  pl.songs.push(songId); await savePlaylists();
  const song = allSongs.find(s => s._id === songId);
  showToast(`"${song?.songName}" added!`);
  const songs = allSongs.filter(s => pl.songs.includes(s._id));
  document.getElementById('playlistDetailCount').textContent = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
  renderSongsList(songs, 'playlistDetailSongs', true, currentOpenPlaylistId);
  searchSongsToAdd(document.getElementById('playlistSongSearch').value);
  renderPlaylistsSection();
}
async function removeSongFromPlaylist(playlistId, songId) {
  const pl = playlists.find(p => p.id === playlistId); if (!pl) return;
  pl.songs = pl.songs.filter(s => s !== songId); await savePlaylists();
  const songs = allSongs.filter(s => pl.songs.includes(s._id));
  document.getElementById('playlistDetailCount').textContent = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
  renderSongsList(songs, 'playlistDetailSongs', true, playlistId);
  renderPlaylistsSection(); showToast('Song removed from playlist.');
}
function openAddToPlaylist(songId) {
  if (currentUser?.isGuest) return showToast('Please login to add to playlists!');
  addToPlaylistSongId = songId;
  const list = document.getElementById('addToPlaylistList');
  list.innerHTML = playlists.length
    ? playlists.map(p => `<div class="playlist-pick-item" onclick="quickAddToPlaylist('${p.id}')">📂 <span>${esc(p.name)}</span><small style="margin-left:auto;color:var(--text-muted);">${p.songs.length} songs</small></div>`).join('')
    : '<div style="color:var(--text-muted);font-size:13px;padding:8px;">No playlists yet. Create one first!</div>';
  document.getElementById('addToPlaylistModal').classList.remove('hidden');
}
function closeAddToPlaylist() { document.getElementById('addToPlaylistModal').classList.add('hidden'); addToPlaylistSongId = null; }
async function quickAddToPlaylist(playlistId) {
  const pl = playlists.find(p => p.id === playlistId);
  if (!pl || !addToPlaylistSongId) return;
  if (!pl.songs.includes(addToPlaylistSongId)) { pl.songs.push(addToPlaylistSongId); await savePlaylists(); renderPlaylistsSection(); }
  closeAddToPlaylist(); showToast(`Added to "${pl.name}"!`);
}

// ===== SEARCH =====
function liveSearch(query) {
  query = query.trim().toLowerCase();
  if (!query) { document.getElementById('searchResultsSection').classList.add('hidden'); document.getElementById('homeSection').classList.remove('hidden'); return; }
  const results = allSongs.filter(s =>
    s.songName?.toLowerCase().includes(query) || s.singer?.toLowerCase().includes(query) ||
    s.movieName?.toLowerCase().includes(query) || s.musicDirector?.toLowerCase().includes(query) ||
    s.label?.toLowerCase().includes(query) || s.genre?.toLowerCase().includes(query) ||
    s.cast?.toLowerCase().includes(query) || s.movieDirector?.toLowerCase().includes(query)
  );
  document.getElementById('homeSection').classList.add('hidden');
  document.getElementById('searchResultsSection').classList.remove('hidden');
  renderSongsGrid(results, 'searchResultsGrid');
}
function clearSearch() {
  document.getElementById('globalSearch').value = '';
  document.getElementById('searchResultsSection').classList.add('hidden');
  document.getElementById('homeSection').classList.remove('hidden');
}

// ===== SECTIONS =====
function showSection(name) {
  // Push to browser history (so back button works)
  if (name !== currentSection) {
    history.pushState({ section: name }, '', '');
  }
  showSectionInternal(name);
}

function showSectionInternal(name) {
  currentSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById('searchResultsSection').classList.add('hidden');
  ['navLiked','navPlaylists','navAccount'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  const navMap = { liked: 'navLiked', playlists: 'navPlaylists', account: 'navAccount' };
  if (navMap[name]) document.getElementById(navMap[name])?.classList.add('active');
  const map = { home: 'homeSection', search: 'homeSection', liked: 'likedSection', playlists: 'playlistsSection', account: 'accountSection' };
  const el = document.getElementById(map[name]);
  if (el) el.classList.remove('hidden');
  // Sync mobile bottom nav
  const mobMap = { home: 'mobHome', search: 'mobSearch', liked: 'mobLiked', playlists: 'mobPlaylists', account: 'mobAccount' };
  if (mobMap[name]) setMobActive(mobMap[name]);
  if (name === 'liked') renderLikedSection();
  if (name === 'playlists') {
    renderPlaylistsSection();
    document.getElementById('playlistDetail')?.classList.add('hidden');
    document.getElementById('playlistsGrid')?.classList.remove('hidden');
    currentOpenPlaylistId = null;
  }
  if (name === 'account') renderAccountSection();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== SONG DETAIL =====
function openSongDetail(id) {
  const song = allSongs.find(s => s._id === id); if (!song) return;
  currentDetailSongId = id;
  document.getElementById('sdTitle').textContent = song.songName;
  const img = document.getElementById('sdCover');
  img.src = song.coverUrl || ''; img.style.display = song.coverUrl ? 'block' : 'none';
  const fields = [
    ['Movie / Album', song.movieName], ['Cast', song.cast],
    ['Singer', song.singer], ['Music Director', song.musicDirector],
    ['Lyricist', song.genre], ['Movie Director', song.movieDirector],
    ['Label', song.label], ['Year', song.year]
  ];
  document.getElementById('sdTable').innerHTML = fields.filter(([,v]) => v).map(([k,v]) => `<tr><td>${k}</td><td>${esc(String(v))}</td></tr>`).join('');
  document.getElementById('songDetailModal').classList.remove('hidden');
}
function closeSongDetail() { document.getElementById('songDetailModal').classList.add('hidden'); currentDetailSongId = null; }
function playFromDetail() { if (requireLogin()) return; if (currentDetailSongId) { playSong(currentDetailSongId); closeSongDetail(); } }
function toggleLikeFromDetail() { if (currentDetailSongId) toggleLike(currentDetailSongId); }

// ===== ACCOUNT =====
function renderAccountSection() {
  if (!currentUser || currentUser.isGuest) {
    document.getElementById('accountName').textContent = 'Guest User';
    document.getElementById('accountEmail').textContent = 'Not logged in';
    document.getElementById('accountStats').innerHTML = '';
    document.getElementById('accountAvatar').textContent = '?';
    const el = document.getElementById('logoutUserName'); if (el) el.textContent = 'Guest';
    return;
  }
  document.getElementById('accountName').textContent = currentUser.name;
  document.getElementById('accountEmail').textContent = currentUser.email;
  document.getElementById('accountAvatar').textContent = currentUser.name[0].toUpperCase();
  document.getElementById('accountStats').innerHTML = `
    <span class="account-stat"><strong>${likedSongs.length}</strong> Liked Songs</span>
    <span class="account-stat" style="margin-left:20px;"><strong>${playlists.length}</strong> Playlists</span>`;
  document.getElementById('newDisplayName').value = currentUser.name;
  const el = document.getElementById('logoutUserName');
  if (el) el.textContent = `${currentUser.name} (${currentUser.email})`;
}
async function changeDisplayName() {
  const newName = document.getElementById('newDisplayName').value.trim();
  if (!newName) return;
  if (currentUser.isGuest) return showMsg('nameChangeMsg', 'Please login first!');
  try {
    const res = await fetch(`${API_BASE_URL}/users/${currentUser.id}/profile`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ name: newName }) });
    if (!res.ok) throw new Error();
  } catch {
    const users = JSON.parse(localStorage.getItem('rhythmUsers') || '[]');
    const idx = users.findIndex(u => u.id === currentUser.id);
    if (idx !== -1) { users[idx].name = newName; localStorage.setItem('rhythmUsers', JSON.stringify(users)); }
  }
  currentUser.name = newName; localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
  updateTopnavUser(); renderAccountSection();
  showMsg('nameChangeMsg', '✅ Name updated!'); setTimeout(() => showMsg('nameChangeMsg', ''), 3000);
}
async function changePassword() {
  if (currentUser.isGuest) return showMsg('passwordChangeMsg', 'Please login first!');
  const current = document.getElementById('currentPassword').value;
  const newPwd  = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmNewPassword').value;
  if (!current || !newPwd || !confirm) return showMsg('passwordChangeMsg', 'Please fill all fields.');
  if (newPwd.length < 6) return showMsg('passwordChangeMsg', 'Min 6 characters required.');
  if (newPwd !== confirm) return showMsg('passwordChangeMsg', 'Passwords do not match.');
  try {
    const res = await fetch(`${API_BASE_URL}/users/${currentUser.id}/password`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ currentPassword: current, newPassword: newPwd }) });
    const data = await res.json();
    if (!res.ok) return showMsg('passwordChangeMsg', data.message || 'Failed.');
    showMsg('passwordChangeMsg', '✅ Password updated!');
  } catch {
    const users = JSON.parse(localStorage.getItem('rhythmUsers') || '[]');
    const user = users.find(u => u.id === currentUser.id);
    if (!user) return showMsg('passwordChangeMsg', 'User not found.');
    if (user.password !== current) return showMsg('passwordChangeMsg', 'Current password is incorrect.');
    user.password = newPwd; localStorage.setItem('rhythmUsers', JSON.stringify(users));
    showMsg('passwordChangeMsg', '✅ Password updated!');
  }
  ['currentPassword','newPassword','confirmNewPassword'].forEach(id => document.getElementById(id).value = '');
  // Uncheck show password checkbox
  const cb = document.querySelector('input[onchange*="currentPassword"]');
  if (cb) { cb.checked = false; togglePwdGroup(['currentPassword','newPassword','confirmNewPassword'], cb); }
  setTimeout(() => showMsg('passwordChangeMsg', ''), 4000);
}

// ===== CONFIRM MODAL =====
let confirmCallback = null;
function openConfirm(title, msg, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  confirmCallback = callback;
  // Close any open context menus first
  document.getElementById('songContextMenu')?.classList.add('hidden');
  document.getElementById('playlistContextMenu')?.classList.add('hidden');
  document.getElementById('ctxBackdrop')?.classList.add('hidden');
  const modal = document.getElementById('confirmModal');
  modal.classList.remove('hidden');
  modal.style.zIndex = '10000'; // ensure above everything
  document.getElementById('confirmYesBtn').onclick = () => {
    closeConfirm();
    if (confirmCallback) confirmCallback();
  };
}
function closeConfirm() {
  document.getElementById('confirmModal').classList.add('hidden');
  confirmCallback = null;
}

// ===== SPACEBAR =====
document.addEventListener('keydown', function(e) {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (e.code === 'Space' && currentQueue[currentSongIndex]) { e.preventDefault(); togglePlayPause(); }
});

// ===== TOAST & MSG =====
function showToast(msg) {
  const existing = document.querySelector('.toast'); if (existing) existing.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
}
function showMsg(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }

// ===== MOBILE BOTTOM NAV =====
function setMobActive(id) {
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function focusMobileSearch() {
  showSection('home');
  const input = document.getElementById('globalSearch');
  if (input) {
    setTimeout(() => {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Close modals on overlay click
['createPlaylistModal','renamePlaylistModal','addToPlaylistModal','songDetailModal','confirmModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });
});
const authModalEl = document.getElementById('authModal');
if (authModalEl) {
  authModalEl.addEventListener('click', function(e) {
    if (e.target === this && currentUser?.isGuest) { this.classList.add('hidden'); this.classList.remove('active'); }
  });
}