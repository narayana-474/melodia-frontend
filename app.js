// ===================================================================
// MELODIA — USER PANEL JavaScript
// ===================================================================
// ── Auto-detect backend URL ──────────────────────────────────────────
// • On localhost → use local Node server
// • On any deployed domain → use your Render/Railway/etc. backend URL
//   👇 Replace this with your actual deployed backend URL
const DEPLOYED_BACKEND_URL = 'https://melodia-backend-1i9l.onrender.com/api';

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '')
  ? 'http://localhost:5000/api'
  : DEPLOYED_BACKEND_URL;

// ── Wake Render server if sleeping (free tier sleeps after 15 min) ──
async function wakeUpServer(statusElId, maxWaitMs = 28000) {
  const el = statusElId ? document.getElementById(statusElId) : null;
  const ping = async () => {
    try { const r = await fetch(`${API_BASE_URL}/songs`, { cache: 'no-store' }); return r.ok; }
    catch { return false; }
  };
  if (await ping()) return true;
  if (el) { el.style.color = '#f59e0b'; el.textContent = '⏳ Waking up server, please wait…'; }
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 3000));
    if (await ping()) { if (el) { el.style.color = ''; el.textContent = ''; } return true; }
    const s = Math.round((Date.now() - start) / 1000);
    if (el) el.textContent = `⏳ Starting server… (${s}s)`;
  }
  if (el) { el.style.color = ''; el.textContent = ''; }
  return false;
}

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
  firebaseApp = firebase.initializeApp(firebaseConfig);
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
  const name = fu.displayName || fu.email?.split('@')[0] || 'User';
  const email = fu.email;
  const uid = fu.uid;
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
let loopMode = 'playlist';
let originalQueue = [];
let currentSection = 'home';

const audio = document.getElementById('audioPlayer');

// ===== INIT =====
window.onload = async () => {
  setGreeting();
  const saved = localStorage.getItem('rhythmUser');
  if (saved) { currentUser = JSON.parse(saved); startApp(); }
};

// ===== PREVENT PULL-TO-REFRESH =====
let _touchStartY = 0;
document.addEventListener('touchstart', (e) => {
  _touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  const fullscreen = document.getElementById('npFullscreen');
  const queuePanel = document.getElementById('queuePanel');
  if (fullscreen && !fullscreen.classList.contains('hidden') && fullscreen.contains(e.target)) return;
  if (queuePanel && !queuePanel.classList.contains('hidden') && queuePanel.contains(e.target)) return;
  // Only block if pulling DOWN while at very top of page
  const dy = e.touches[0].clientY - _touchStartY;
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  if (dy > 0 && scrollTop === 0) {
    e.preventDefault();
  }
}, { passive: false });

function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById('timeGreeting');
  if (el) el.textContent = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

// ===== RESPONSIVE SEARCH PLACEHOLDER =====
function updateSearchPlaceholder() {
  const input = document.getElementById('globalSearch');
  if (!input) return;
  if (window.innerWidth <= 400) input.placeholder = 'Search...';
  else if (window.innerWidth <= 600) input.placeholder = 'Search songs...';
  else input.placeholder = 'Search songs, artists...';
}
window.addEventListener('resize', updateSearchPlaceholder);
updateSearchPlaceholder();

// ===== AUTH =====
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('signupForm').classList.add('hidden');
  document.getElementById(tab + 'Form').classList.remove('hidden');
  event.target.classList.add('active');
}

async function loginUser() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showAuthError('loginError', 'Please fill all fields.');

  // Show connecting message in case server is waking up (Render free tier)
  showAuthError('loginError', '⏳ Connecting to server…');
  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) return showAuthError('loginError', data.message || 'Login failed.');
    showAuthError('loginError', ''); // clear the connecting message
    currentUser = data.user;
    localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
    localStorage.setItem('rhythmToken', data.token);
    startApp();
  } catch {
    // Network error — server may be starting up (Render free tier sleeps)
    showAuthError('loginError', '⏳ Server is starting up, please wait a moment and try again…');
  }
}

// Blocked temporary/disposable email domains
const BLOCKED_EMAIL_DOMAINS = [
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'guerrillamail.info',
  'spam4.me', 'trashmail.com', 'trashmail.me', 'trashmail.net', 'trashmail.org',
  'dispostable.com', 'yopmail.com', 'yopmail.fr', 'yomail.info', 'cool.fr.nf',
  'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr',
  'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'maildrop.cc', 'mailnull.com', 'spamgourmet.com', 'spamgourmet.net',
  'fakeinbox.com', 'mailnesia.com', 'discard.email', 'spambox.us',
  'getairmail.com', 'filzmail.com', 'throwam.com', 'tempr.email',
  'dispostable.com', 'mailexpire.com', 'mailnull.com', 'spamhole.com',
  'binkmail.com', 'bobmail.info', 'chammy.info', 'devnullmail.com',
  'objectmail.com', 'ownmail.net', 'pecinan.com', 'proxymail.eu',
  'rklips.com', 'rmqkr.net', 'saint-mike.org', 'spamcon.org',
  'temporaryemail.net', 'temporaryinbox.com', 'tempinbox.co.uk',
  'tempinbox.com', 'thanksnospam.info', 'trbvm.com', 'turual.com',
  'uggsrock.com', 'venompen.com', 'voidbay.com', 'wetrainbayarea.org',
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

// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  SIGNUP — DIRECT REGISTRATION (no OTP/email verify)
// ══════════════════════════════════════════════════════
async function registerUser() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;

  if (!name || !email || !password)
    return showAuthError('signupError', 'Please fill all fields.');
  if (!isValidEmail(email))
    return showAuthError('signupError', 'Please enter a valid email address (e.g. name@gmail.com).');
  if (password.length < 6)
    return showAuthError('signupError', 'Password must be at least 6 characters.');

  showAuthError('signupError', '⏳ Connecting to server…');
  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) return showAuthError('signupError', data.message || 'Sign up failed.');
    showAuthError('signupError', '');
    currentUser = data.user;
    localStorage.setItem('rhythmUser', JSON.stringify(currentUser));
    localStorage.setItem('rhythmToken', data.token);
    startApp();
  } catch {
    // Network error — server may be starting up (Render free tier sleeps)
    showAuthError('signupError', '⏳ Server is starting up, please wait a moment and try again…');
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

  // Sync downloads from cloud (after songs are loaded so we can match IDs)
  if (!currentUser.isGuest) syncDownloadsFromCloud();

  // Restore last section (so page refresh stays on same section)
  const lastSection = localStorage.getItem('melodiaSection') || 'home';
  history.replaceState({ section: lastSection }, '', '');

  // Restore last played song
  restoreLastPlayed();

  // Handle browser back button
  window.addEventListener('popstate', (e) => {
    const state = e.state || {};
    const section = state.section || 'home';
    // Close fullscreen player if open
    const fs = document.getElementById('npFullscreen');
    if (fs && !fs.classList.contains('hidden')) {
      closeNowPlayingScreen();
      history.pushState({ section: currentSection }, '', '');
      return;
    }
    // Close album view if opened from home
    if (state.albumView) {
      document.getElementById('searchResultsSection').classList.add('hidden');
      document.getElementById('homeSection').classList.remove('hidden');
      return;
    }
    // Close playlist detail if open
    const detail = document.getElementById('playlistDetail');
    if (detail && !detail.classList.contains('hidden') && !state.playlistId) {
      closePlaylistDetail();
      return;
    }
    showSectionInternal(section);
  });

  // Restore section after all songs rendered
  if (lastSection !== 'home') showSectionInternal(lastSection);
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
  // Sort by year desc, then by upload date desc as tiebreaker
  allSongs.sort((a, b) => {
    const yearDiff = (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
    if (yearDiff !== 0) return yearDiff;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
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
      onclick="openMovieAlbumForSong('${song._id}')"
      oncontextmenu="openContextMenu(event,'${song._id}')"
      data-song-id="${song._id}">
      ${song.coverUrl ? `<img class="song-card-cover" src="${song.coverUrl}" alt="${esc(song.songName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />` : ''}
      <div class="song-card-cover-placeholder" style="${song.coverUrl ? 'display:none' : ''}">🎵</div>
      <div class="song-card-play-overlay">
        <button class="song-card-play-btn" onclick="event.stopPropagation();playSong('${song._id}')">▶</button>
      </div>
      <div class="song-card-info">
        <div class="song-card-title">${esc(song.songName)}</div>
        <div class="song-card-artist">${esc(song.musicDirector || song.singer || '—')}</div>
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

// Open movie album for a song, then play that specific song when user taps it
function openMovieAlbumForSong(songId) {
  const song = allSongs.find(s => s._id === songId);
  if (!song) return;
  const movieSongs = allSongs.filter(s => s.movieName === song.movieName);
  if (!movieSongs.length) { playSong(songId); return; }

  // Push history so back button returns to home
  history.pushState({ section: 'home', albumView: true }, '', '');

  document.getElementById('homeSection').classList.add('hidden');
  document.getElementById('searchResultsSection').classList.remove('hidden');
  showEntityView(song.movieName, movieSongs, 'Movie Album', '🎬', 'movieName');

  // Highlight the clicked song after render
  setTimeout(() => {
    const items = document.querySelectorAll('#albumSongsList .song-list-item');
    items.forEach(item => {
      if (item.getAttribute('data-song-id') === songId) {
        item.style.background = 'rgba(255,63,108,0.12)';
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, 100);
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
        <div class="song-list-artist">${esc(buildCreditsText(song))} • ${esc(song.movieName)}</div>
      </div>
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
  document.getElementById('ctxArtist').textContent = buildCreditsText(song);
  document.getElementById('ctxLikeText').textContent = isLiked(songId) ? 'Remove from Liked Songs' : 'Add to Liked Songs';
  document.getElementById('ctxLikeBtn').classList.toggle('liked', isLiked(songId));
  // Update download button state
  isDownloaded(songId).then(dl => {
    const btn = document.getElementById('ctxDownloadBtn');
    const txt = document.getElementById('ctxDownloadText');
    if (btn) btn.style.color = dl ? '#3b82f6' : '';
    if (txt) txt.textContent = dl ? 'Downloaded ✓' : 'Download';
  });

  const menu = document.getElementById('songContextMenu');
  const backdrop = document.getElementById('ctxBackdrop');
  menu.classList.remove('hidden');
  backdrop.classList.remove('hidden');

  // Position menu
  if (e) {
    // Desktop right-click — position at cursor
    const menuW = 240, menuH = 320;
    let x = e.clientX, y = e.clientY;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
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

function ctxPlay() { if (ctxSongId) { playSong(ctxSongId); closeContextMenu(); } }
function ctxPlayNext() { if (ctxSongId) { playNext(ctxSongId); closeContextMenu(); } }
function ctxAddToQueue() { if (ctxSongId) { addToQueue(ctxSongId); closeContextMenu(); } }
function ctxAddToPlaylist() { if (ctxSongId) { openAddToPlaylist(ctxSongId); closeContextMenu(); } }
function ctxToggleLike() {
  if (ctxSongId) {
    toggleLike(ctxSongId);
    closeContextMenu(); // close immediately after like/unlike
  }
}
function ctxViewCredits() { if (ctxSongId) { openSongDetail(ctxSongId); closeContextMenu(); } }
function ctxDownload() { if (ctxSongId) { downloadSong(ctxSongId); closeContextMenu(); } }

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
  // Prefer downloaded audio for offline playback
  resolveAudioSrc(song).then(src => {
    audio.src = src;
    audio.loop = loopMode === 'single';
    audio.play().catch(() => { });
    isPlaying = true;
    updateNowPlayingUI(song);
    renderQueue();
    try {
      localStorage.setItem('melodiaLastPlayed', JSON.stringify({ songId: song._id, time: 0 }));
    } catch (e) { }
  });
}

function togglePlayPause() {
  if (requireLogin()) return;
  if (!currentQueue[currentSongIndex]) return;
  if (isPlaying) { audio.pause(); isPlaying = false; }
  else { audio.play(); isPlaying = true; }
  updateFsPlayPauseIcon();
}
function prevSong() { if (requireLogin()) return; if (currentSongIndex > 0) { currentSongIndex--; loadAndPlay(); } }
function nextSong() {
  if (requireLogin()) return;
  if (loopMode === 'single') { audio.currentTime = 0; audio.play(); return; }
  if (isShuffle) { currentSongIndex = Math.floor(Math.random() * currentQueue.length); loadAndPlay(); return; }
  if (currentSongIndex < currentQueue.length - 1) {
    // Still songs left in current queue
    currentSongIndex++; loadAndPlay();
  } else if (loopMode === 'playlist') {
    // Loop the current queue
    currentSongIndex = 0; loadAndPlay();
  } else {
    // End of queue — find current song in full library and play the next one
    const currentSong = currentQueue[currentSongIndex];
    let nextIdx = 0;
    if (currentSong) {
      const globalIdx = allSongs.findIndex(s => s._id === currentSong._id);
      nextIdx = (globalIdx !== -1 && globalIdx < allSongs.length - 1) ? globalIdx + 1 : 0;
    }
    currentQueue = [...allSongs];
    currentSongIndex = nextIdx;
    loadAndPlay();
  }
}
function seekSong(e) { if (!audio.duration) return; audio.currentTime = (e.offsetX / e.currentTarget.offsetWidth) * audio.duration; }
function setVolume(v) { audio.volume = v; }

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  document.getElementById('progressFill').style.width = (audio.currentTime / audio.duration * 100) + '%';
  document.getElementById('currentTime').textContent = fmtTime(audio.currentTime);
  document.getElementById('totalTime').textContent = fmtTime(audio.duration);
  updateFsProgress();
  // Update lock screen progress bar
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && audio.duration) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: audio.currentTime,
      });
    } catch (e) { }
  }
});
audio.addEventListener('ended', () => {
  if (loopMode === 'single') { audio.currentTime = 0; audio.play(); return; }
  if (isShuffle) { currentSongIndex = Math.floor(Math.random() * currentQueue.length); loadAndPlay(); return; }
  if (currentSongIndex < currentQueue.length - 1) {
    currentSongIndex++; loadAndPlay();
  } else if (loopMode === 'playlist') {
    currentSongIndex = 0; loadAndPlay();
  } else {
    // No loop — but still continue playing from full library
    // Find current song in allSongs and play next one
    const currentSong = currentQueue[currentSongIndex];
    const globalIdx = allSongs.findIndex(s => s._id === currentSong?._id);
    if (globalIdx !== -1 && globalIdx < allSongs.length - 1) {
      currentQueue = [...allSongs];
      currentSongIndex = globalIdx + 1;
      loadAndPlay();
    } else if (allSongs.length > 0) {
      // Wrap around to beginning
      currentQueue = [...allSongs];
      currentSongIndex = 0;
      loadAndPlay();
    }
  }
});
audio.addEventListener('play', () => {
  isPlaying = true;
  updateFsPlayPauseIcon();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
audio.addEventListener('pause', () => {
  isPlaying = false;
  updateFsPlayPauseIcon();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audio.addEventListener('timeupdate', () => {
  // Save current time every 5 seconds
  if (Math.floor(audio.currentTime) % 5 === 0 && currentQueue[currentSongIndex]) {
    try {
      localStorage.setItem('melodiaLastPlayed', JSON.stringify({
        songId: currentQueue[currentSongIndex]._id,
        time: Math.floor(audio.currentTime)
      }));
    } catch (e) { }
  }
});

// ===== CREDITS TEXT BUILDER =====
// Splits comma-separated fields, deduplicates across all three fields,
// and returns a single comma-separated string in order:
//   Music Director, Singer 1, Singer 2, ..., Lyricist 1, Lyricist 2, ...
// NOTE: lyricist is stored in song.genre field in this app.
function buildCreditsText(song) {
  const splitField = (val) =>
    (val || '').split(',').map(s => s.trim()).filter(Boolean);

  const directors = splitField(song.musicDirector);
  const singers = splitField(song.singer);
  const lyricists = splitField(song.genre); // genre field stores lyricist name

  const seen = new Set();
  const result = [];

  const addUnique = (name) => {
    const key = name.toLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(name); }
  };

  directors.forEach(addUnique);
  singers.forEach(addUnique);
  lyricists.forEach(addUnique);

  return result.length ? result.join(', ') : '—';
}

// Returns count of unique credit names across all three fields
function buildCreditsCount(song) {
  const splitField = (val) =>
    (val || '').split(',').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  [...splitField(song.musicDirector), ...splitField(song.singer), ...splitField(song.genre)]
    .forEach(n => seen.add(n.toLowerCase()));
  return seen.size;
}

function updateNowPlayingUI(song) {

  // ===== MEDIA SESSION API — lock screen / earphone controls =====
  if ('mediaSession' in navigator) {
    // Build artwork array from cover URL
    const artwork = song.coverUrl
      ? [{ src: song.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.songName || 'Unknown Song',
      artist: buildCreditsText(song),
      album: song.movieName || '',
      artwork,
    });

    // Hardware button handlers (earphones, lock screen, Bluetooth)
    navigator.mediaSession.setActionHandler('play', () => { audio.play(); isPlaying = true; updateFsPlayPauseIcon(); });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); isPlaying = false; updateFsPlayPauseIcon(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => prevSong());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextSong());
    navigator.mediaSession.setActionHandler('seekto', e => {
      if (e.seekTime !== undefined) audio.currentTime = e.seekTime;
    });
    // Seek forward/backward (some earphones send these)
    navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.currentTime + 10, audio.duration || 0); });
    navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(audio.currentTime - 10, 0); });
  }

  // Mini bar — title with scroll if long
  const npTitleEl = document.getElementById('npTitle');
  npTitleEl.classList.remove('np-title-scroll');
  npTitleEl.innerHTML = `<span class="np-title-inner">${esc(song.songName)}</span>`;
  // Measure after paint to check if text overflows
  setTimeout(() => {
    const inner = npTitleEl.querySelector('.np-title-inner');
    if (inner && inner.scrollWidth > npTitleEl.clientWidth + 2) {
      // Double the text with a gap for seamless infinite scroll
      inner.textContent = song.songName + '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' + song.songName;
      npTitleEl.classList.add('np-title-scroll');
    }
  }, 100);
  // Build scroll text: Music Director, unique Singers, unique Lyricists (no duplicates)
  const npArtistText = buildCreditsText(song);
  const npArtistEl = document.getElementById('npArtist');
  npArtistEl.classList.remove('np-artist-scroll');
  // Render plain first, then measure — scroll only if text overflows the container
  npArtistEl.innerHTML = `<span class="np-artist-inner">${esc(npArtistText)}</span>`;
  setTimeout(() => {
    const inner = npArtistEl.querySelector('.np-artist-inner');
    if (inner && inner.scrollWidth > npArtistEl.clientWidth + 2) {
      const sep = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
      const doubled = npArtistText + sep + npArtistText;
      inner.textContent = doubled;
      npArtistEl.classList.add('np-artist-scroll');
    }
  }, 100);
  const cover = document.getElementById('npCover');
  cover.src = song.coverUrl || ''; cover.style.display = song.coverUrl ? 'block' : 'none';

  // Desktop like button
  const npDesktopLike = document.getElementById('npDesktopLikeBtn');
  if (npDesktopLike) npDesktopLike.classList.toggle('liked', isLiked(song._id));

  // Fullscreen
  // Song title — apply scroll animation if text is long
  const titleEl = document.getElementById('npfsTitle');
  titleEl.classList.remove('npfs-title-scroll');
  // Use doubled text inside a span for infinite marquee scroll
  titleEl.innerHTML = `<span class="npfs-title-inner">${esc(song.songName)}</span>`;
  // Measure after paint
  setTimeout(() => {
    const inner = titleEl.querySelector('.npfs-title-inner');
    if (inner && inner.scrollWidth > titleEl.clientWidth + 2) {
      inner.textContent = song.songName + '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' + song.songName;
      titleEl.classList.add('npfs-title-scroll');
    }
  }, 100);

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

  // Scroll only if text overflows container
  const marqueeText = buildCreditsText(song);
  let marqueeEl = document.getElementById('npfsMarquee');
  const marqueeWrap = marqueeEl.parentElement;
  marqueeWrap.classList.remove('npfs-marquee-scroll');
  // Recreate the element to bust animation cache for accurate measuring
  marqueeWrap.innerHTML = `<div class="npfs-marquee" id="npfsMarquee">${esc(marqueeText)}</div>`;
  marqueeEl = document.getElementById('npfsMarquee');

  setTimeout(() => {
    const overflows = marqueeEl.scrollWidth > marqueeWrap.clientWidth + 2;
    if (overflows) {
      const sep = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
      marqueeEl.textContent = `${marqueeText}${sep}${marqueeText}`;
      marqueeWrap.classList.add('npfs-marquee-scroll');
    }
  }, 100);

  const isL = isLiked(song._id);
  document.getElementById('npLikeBtn')?.classList.toggle('liked', isL);
  document.getElementById('npfsLikeBtn')?.classList.toggle('liked', isL);
  document.getElementById('npDesktopLikeBtn')?.classList.toggle('liked', isL);

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
  renderFsQueue();

  // Re-measure title scroll now that fullscreen is visible (was hidden during updateNowPlayingUI)
  setTimeout(() => {
    const song = currentQueue[currentSongIndex];
    if (!song) return;

    // --- Title ---
    const titleEl = document.getElementById('npfsTitle');
    // Reset and re-render cleanly (element was hidden before, so scrollWidth was 0)
    titleEl.classList.remove('npfs-title-scroll');
    const plain = `<span class="npfs-title-inner">${esc(song.songName)}</span>`;
    titleEl.innerHTML = plain;
    requestAnimationFrame(() => {
      const inner = titleEl.querySelector('.npfs-title-inner');
      if (inner && inner.scrollWidth > titleEl.clientWidth + 2) {
        inner.textContent = song.songName + '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0' + song.songName;
        titleEl.classList.add('npfs-title-scroll');
      }
    });

    // --- Marquee (artist credits) ---
    let marqueeEl = document.getElementById('npfsMarquee');
    const marqueeWrap = marqueeEl.parentElement;
    const marqueeText = buildCreditsText(song);
    marqueeWrap.classList.remove('npfs-marquee-scroll');
    // Recreate element to force clear bounds cache
    marqueeWrap.innerHTML = `<div class="npfs-marquee" id="npfsMarquee">${esc(marqueeText)}</div>`;
    marqueeEl = document.getElementById('npfsMarquee');

    requestAnimationFrame(() => {
      const overflows = marqueeEl.scrollWidth > marqueeWrap.clientWidth + 2;
      if (overflows) {
        const sep = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
        marqueeEl.textContent = `${marqueeText}${sep}${marqueeText}`;
        marqueeWrap.classList.add('npfs-marquee-scroll');
      }
    });
  }, 80);
}

function closeNowPlayingScreen() {
  const fs = document.getElementById('npFullscreen');
  fs.style.transform = '';
  fs.classList.add('npfs-closing');
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

  updateLoopUI();
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
  const fill = document.getElementById('npfsProgressFill');
  const thumb = document.getElementById('npfsProgressThumb');
  if (fill) fill.style.width = pct + '%';
  if (thumb) thumb.style.left = pct + '%';
  document.getElementById('npfsCurrentTime').textContent = fmtTime(audio.currentTime);
  document.getElementById('npfsTotalTime').textContent = fmtTime(audio.duration);
}
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// ===== SHUFFLE & LOOP =====
function setShuffle(state) {
  if (isShuffle === state) return;
  isShuffle = state;
  if (isShuffle) {
    originalQueue = [...currentQueue];
    const current = currentQueue[currentSongIndex];
    const rest = currentQueue.filter((_, i) => i !== currentSongIndex);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[rest[i], rest[j]] = [rest[j], rest[i]]; }
    currentQueue = [current, ...rest]; currentSongIndex = 0;
  } else {
    if (originalQueue.length) {
      const current = currentQueue[currentSongIndex];
      currentQueue = [...originalQueue];
      currentSongIndex = currentQueue.findIndex(s => s._id === current._id);
      if (currentSongIndex === -1) currentSongIndex = 0;
    }
  }
  renderQueue();
}

function cycleLoop() {
  if (loopMode === 'playlist') {
    loopMode = 'single';
    setShuffle(false);
  } else if (loopMode === 'single') {
    loopMode = 'shuffle';
    setShuffle(true);
  } else {
    loopMode = 'playlist';
    setShuffle(false);
  }
  updateLoopUI();
  const msgs = { playlist: '🔁 Playlist Loop On', single: '🔂 Single Loop On', shuffle: '🔀 Shuffle On' };
  showToast(msgs[loopMode]);
}

function updateLoopUI() {
  document.querySelectorAll('.loop-icon-repeat').forEach(el => el.classList.toggle('hidden', loopMode !== 'playlist'));
  document.querySelectorAll('.loop-icon-repeat1').forEach(el => el.classList.toggle('hidden', loopMode !== 'single'));
  document.querySelectorAll('.loop-icon-shuffle').forEach(el => el.classList.toggle('hidden', loopMode !== 'shuffle'));

  const loopBtn = document.getElementById('loopBtn');
  const fsLoopBtn = document.getElementById('npfsLoopBtn');
  if (loopBtn) loopBtn.classList.add('active');
  if (fsLoopBtn) fsLoopBtn.classList.add('active');

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
  const btn = document.getElementById('lyricsBtn');
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
  const titleEl = document.getElementById('lyricsPanelTitle');
  const artistEl = document.getElementById('lyricsPanelArtist');
  const textEl = document.getElementById('lyricsPanelText');
  const emptyEl = document.getElementById('lyricsPanelEmpty');
  if (!song) {
    if (titleEl) titleEl.textContent = '—';
    if (artistEl) artistEl.textContent = '—';
    if (textEl) textEl.textContent = '';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  if (titleEl) titleEl.textContent = song.songName;
  if (artistEl) artistEl.textContent = buildCreditsText(song);
  if (song.lyrics && song.lyrics.trim()) {
    if (textEl) { textEl.textContent = song.lyrics; textEl.style.display = 'block'; }
    if (emptyEl) emptyEl.style.display = 'none';
  } else {
    if (textEl) { textEl.textContent = ''; textEl.style.display = 'none'; }
    if (emptyEl) emptyEl.style.display = 'flex';
  }
}

// ===== QUEUE PANEL =====
function toggleQueue() {
  const panel = document.getElementById('queuePanel');
  const isOpen = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  // Sync active state on both possible queue buttons
  ['queueBtn', 'queueDesktopBtn'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', isOpen);
  });
  // Mobile backdrop
  if (window.innerWidth <= 768) {
    let backdrop = document.getElementById('queueBackdrop');
    if (isOpen) {
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'queueBackdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:349;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);';
        backdrop.onclick = toggleQueue;
        document.body.appendChild(backdrop);
      }
    } else {
      backdrop?.remove();
    }
  }
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

  // Also render embedded fullscreen queue
  renderFsQueue();
}

function renderFsQueue() {
  const fsListEl = document.getElementById('npfsQueueList');
  if (!fsListEl) return;
  const current = currentQueue[currentSongIndex];
  const upcoming = currentQueue.slice(currentSongIndex + 1);

  // Show now playing + up to 10 upcoming
  const items = [];

  // Now playing item
  if (current) {
    items.push(`<div class="npfs-queue-item npfs-playing-now">
      ${current.coverUrl ? `<img class="npfs-queue-cover" src="${current.coverUrl}" alt="" />` : `<div class="npfs-queue-cover-ph">🎵</div>`}
      <div class="npfs-queue-meta">
        <div class="npfs-queue-title">${esc(current.songName)}</div>
        <div class="npfs-queue-artist">${esc(buildCreditsText(current))}</div>
      </div>
      <span class="npfs-queue-now-badge">▶ NOW</span>
    </div>`);
  }

  // Upcoming
  upcoming.slice(0, 10).forEach((s, i) => {
    const idx = currentSongIndex + 1 + i;
    items.push(`<div class="npfs-queue-item" onclick="jumpToQueue(${idx})">
      ${s.coverUrl ? `<img class="npfs-queue-cover" src="${s.coverUrl}" alt="" />` : `<div class="npfs-queue-cover-ph">🎵</div>`}
      <div class="npfs-queue-meta">
        <div class="npfs-queue-title">${esc(s.songName)}</div>
        <div class="npfs-queue-artist">${esc(buildCreditsText(s))}</div>
      </div>
    </div>`);
  });

  fsListEl.innerHTML = items.length ? items.join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">No upcoming songs</div>';

  // Show/hide the wrap
  const wrap = document.getElementById('npfsQueueWrap');
  if (wrap) wrap.style.display = 'block';
}

function queueItemHTML(song, idx, isNow) {
  return `<div class="queue-item ${isNow ? 'playing-now' : ''}" onclick="${isNow ? '' : `jumpToQueue(${idx})`}">
    ${song.coverUrl ? `<img class="queue-cover" src="${song.coverUrl}" alt="" />` : `<div class="queue-cover-ph">🎵</div>`}
    <div class="queue-meta">
      <div class="queue-title">${esc(song.songName)}</div>
      <div class="queue-artist">${esc(buildCreditsText(song))}</div>
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
  // Update all song card like buttons
  document.querySelectorAll(`[id="likeBtn-${id}"]`).forEach(btn => {
    btn.classList.toggle('liked', liked);
  });
  // Sync mini bar like button
  const miniLike = document.getElementById('npLikeBtn');
  if (miniLike && currentQueue[currentSongIndex]?._id === id) miniLike.classList.toggle('liked', liked);
  // Sync fullscreen like button
  const fsLike = document.getElementById('npfsLikeBtn');
  if (fsLike && currentQueue[currentSongIndex]?._id === id) fsLike.classList.toggle('liked', liked);
  // Sync desktop like button
  const desktopLike = document.getElementById('npDesktopLikeBtn');
  if (desktopLike && currentQueue[currentSongIndex]?._id === id) desktopLike.classList.toggle('liked', liked);
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

  const menu = document.getElementById('playlistContextMenu');
  const backdrop = document.getElementById('ctxBackdrop');
  // Close song context menu if open
  document.getElementById('songContextMenu')?.classList.add('hidden');
  menu.classList.remove('hidden');
  backdrop.classList.remove('hidden');

  if (e) {
    // Desktop right-click
    const menuW = 240, menuH = 180;
    let x = e.clientX, y = e.clientY;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
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
  // Push history so mobile back button closes the detail
  history.pushState({ section: 'playlists', playlistId: id }, '', '');
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
let currentAlbumSongs = [];

// Strip common suffixes to get the core search intent
function stripSuffix(q) {
  return q.replace(/\s+(songs?|music|album|tracks?|hits?|all songs?)\s*$/i, '').trim();
}

// Normalize string — remove spaces and lowercase for space-insensitive matching
function normalizeStr(s) {
  return (s || '').toLowerCase().replace(/\s+/g, '');
}

// Check if a string contains the query (or vice versa) — flexible partial match, space-aware
function fuzzyMatch(str, q) {
  if (!str || !q) return false;
  const s = str.toLowerCase(), t = q.toLowerCase();
  if (s.includes(t) || t.includes(s)) return true;
  // Space-normalized match (e.g. "TheRajaSaab" matches "The Raja Saab")
  const sn = normalizeStr(s), tn = normalizeStr(t);
  if (sn === tn) return true;
  // Prevent aggressive bridging across boundaries for short acronym-like queries
  // (e.g., stopping "ntr" from matching "Silambarasan TR" -> "silambarasantr")
  if (tn.length > 3) {
    return sn.includes(tn) || tn.includes(sn);
  }
  return false;
}

// Similarity score (0–1): how well the entity value covers the query
// A score of 1.0 means exact match; prefer values that are close in length to the query
function similarityScore(str, q) {
  if (!str || !q) return 0;
  const s = normalizeStr(str), t = normalizeStr(q);
  if (!s || !t) return 0;
  if (s === t) return 1;
  if (s.includes(t)) return t.length / s.length;   // query fits inside entity
  if (t.includes(s)) return s.length / t.length;   // entity fits inside query
  return 0;
}

// Score: how many songs match this entity value for a given field
function scoreEntity(songs, field, q) {
  const matched = songs.filter(s => {
    const val = (s[field] || '').toLowerCase();
    // For multi-value fields like cast/singer/song_category, split by comma
    if (field === 'cast' || field === 'singer' || field === 'song_category') {
      return val.split(',').map(p => p.trim()).some(p => fuzzyMatch(p, q));
    }
    return fuzzyMatch(val, q);
  });
  return { matched, score: matched.length };
}

function liveSearch(query) {
  const clearBtn = document.querySelector('.search-clear-btn');
  if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);
  const raw = query.trim().toLowerCase();
  if (!raw) {
    document.getElementById('searchResultsSection').classList.add('hidden');
    document.getElementById('homeSection').classList.remove('hidden');
    return;
  }
  document.getElementById('homeSection').classList.add('hidden');
  document.getElementById('searchResultsSection').classList.remove('hidden');

  // Strip "songs", "music" etc suffix to get core name
  const coreQuery = stripSuffix(raw);

  // Broad match: find any song touching this query across all fields
  const broadResults = allSongs.filter(s => {
    const fields = [s.songName, s.movieName, s.singer, s.musicDirector,
    s.movieDirector, s.cast, s.label, s.genre,
    s.song_category, s.song_language];
    return fields.some(f => fuzzyMatch(f || '', coreQuery));
  });

  if (!broadResults.length) { showNoResults(raw); return; }

  // ── Best-match entity detection ──────────────────────────────────
  // Evaluate ALL field types simultaneously and pick the entity with the
  // HIGHEST similarity score to the query (more specific = higher score).
  // This prevents a short category name like "Love" from beating a specific
  // movie name like "Love Insurance Kompany" for the query "love insurance kompany".
  const checks = [
    { field: 'movieName', label: 'Movie Album', icon: '🎬' },
    { field: 'singer', label: 'Artist', icon: '👤' },
    { field: 'musicDirector', label: 'Artist', icon: '👤' },
    { field: 'cast', label: 'Artist', icon: '👤' },
    { field: 'movieDirector', label: 'Artist', icon: '👤' },
    { field: 'genre', label: 'Artist', icon: '👤' },
    { field: 'song_category', label: 'Category', icon: '🎵' },
    { field: 'song_language', label: 'Language', icon: '🎵' },
  ];

  let bestVal = null, bestScore = 0, bestField = null, bestLabel = null, bestIcon = null;

  for (const { field, label, icon } of checks) {
    // Collect all unique individual values for this field among broad results
    const uniqueVals = new Set();
    broadResults.forEach(s => {
      const val = s[field] || '';
      if (field === 'cast' || field === 'singer' || field === 'song_category') {
        val.split(',').map(p => p.trim()).filter(Boolean).forEach(p => uniqueVals.add(p));
      } else {
        if (val) uniqueVals.add(val);
      }
    });

    for (const val of uniqueVals) {
      const sim = similarityScore(val, coreQuery);
      if (sim === 0) continue;
      // Slight tie-break: among equal similarity scores, prefer longer (more specific) entity names
      const tieScore = sim + (normalizeStr(val).length / 100000);
      if (tieScore > bestScore) {
        const { matched } = scoreEntity(allSongs, field, val);
        if (matched.length >= 1) {
          bestScore = tieScore;
          bestVal = val;
          bestField = field;
          bestLabel = label;
          bestIcon = icon;
        }
      }
    }
  }

  if (bestVal) {
    // For person-type fields, expand results to ALL songs where the name appears
    // in ANY person-related field (not just the detected field)
    let allMatched;
    if (['singer', 'cast', 'musicDirector', 'movieDirector', 'genre'].includes(bestField)) {
      allMatched = allSongs.filter(s => {
        const personFields = [
          s.singer || '', s.cast || '', s.musicDirector || '',
          s.movieDirector || '', s.genre || ''
        ];
        return personFields.some(f =>
          f.split(',').map(p => p.trim()).some(p => fuzzyMatch(p, bestVal))
        );
      });
    } else {
      const result = scoreEntity(allSongs, bestField, bestVal);
      allMatched = result.matched;
    }
    if (allMatched.length >= 1) {
      showEntityView(bestVal, allMatched, bestLabel, bestIcon, bestField);
      return;
    }
  }

  // ── Fallback: grouped results ────────────────────────────────────
  showGroupedResults(raw, broadResults);
}

function showEntityView(name, songs, label, icon, field) {
  currentAlbumSongs = songs;
  document.getElementById('albumView').classList.remove('hidden');
  document.getElementById('genericSearch').classList.add('hidden');

  document.getElementById('albumHeroType').textContent = label;
  // Append " Songs" to the title for all entity types except Movie Album
  const displayName = field === 'movieName' ? name : name + ' Songs';
  document.getElementById('albumHeroTitle').textContent = displayName;

  // Build subtitle
  const movies = [...new Set(songs.map(s => s.movieName).filter(Boolean))];
  let sub = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
  if (field === 'movieName') {
    const md = songs[0]?.musicDirector || '';
    const dir = songs[0]?.movieDirector || '';
    if (md) sub += `  •  🎼 ${md}`;
    if (dir) sub += `  •  🎬 ${dir}`;
  } else {
    sub += `  •  ${movies.length} movie${movies.length !== 1 ? 's' : ''}`;
  }
  document.getElementById('albumHeroSub').textContent = sub;

  // Cover art — only show for Movie Album
  const img = document.getElementById('albumHeroCoverImg');
  const ph = document.getElementById('albumHeroCoverPh');
  const coverWrap = document.getElementById('albumHeroCover');
  let collage = coverWrap.querySelector('.album-collage');

  if (field === 'movieName') {
    // Movie album: show actual cover
    const covers = [...new Set(songs.map(s => s.coverUrl).filter(Boolean))];
    if (collage) collage.remove();
    if (covers.length >= 1) {
      img.src = covers[0]; img.classList.remove('hidden'); ph.style.display = 'none';
      img.onerror = () => { img.classList.add('hidden'); ph.style.display = 'flex'; ph.textContent = '🎬'; };
    } else {
      img.classList.add('hidden'); ph.style.display = 'flex'; ph.textContent = '🎬';
    }
  } else {
    // Non-movie: show appropriate placeholder icon
    if (collage) collage.remove();
    img.classList.add('hidden'); ph.style.display = 'flex';
    // Category and Language get music note icon; people get human icon
    ph.textContent = (field === 'song_category' || field === 'song_language') ? '🎵' : '👤';
  }

  // For all person-type fields — group songs by movie
  if (['cast', 'movieDirector', 'singer', 'musicDirector', 'genre'].includes(field)) {
    const listEl = document.getElementById('albumSongsList');
    listEl.innerHTML = '';
    const byMovie = {};
    songs.forEach(s => { const k = s.movieName || 'Other'; if (!byMovie[k]) byMovie[k] = []; byMovie[k].push(s); });
    Object.entries(byMovie).forEach(([movie, msongs]) => {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);padding:16px 0 6px;';
      h.textContent = movie;
      listEl.appendChild(h);
      msongs.forEach(song => {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderSongsListItem(song);
        listEl.appendChild(tmp.firstChild);
      });
    });
    listEl._songsList = songs;
  } else {
    renderSongsList(songs, 'albumSongsList');
  }
}

function renderSongsListItem(song) {
  const globalIdx = allSongs.findIndex(s => s._id === song._id);
  return `<div class="song-list-item ${currentQueue[currentSongIndex]?._id === song._id ? 'playing' : ''}"
    onclick="playSongInAlbum('${song._id}')"
    oncontextmenu="openContextMenu(event,'${song._id}')"
    data-song-id="${song._id}">
    ${song.coverUrl ? `<img class="song-list-cover" src="${song.coverUrl}" alt="" onerror="this.outerHTML='<div class=song-list-cover-ph>🎵</div>'" />` : `<div class="song-list-cover-ph">🎵</div>`}
    <div class="song-list-meta">
      <div class="song-list-title">${esc(song.songName)}</div>
      <div class="song-list-artist">${esc(buildCreditsText(song))} • ${esc(song.movieName)}</div>
    </div>
  </div>`;
}

// Play song from album view — sets queue to the album songs
function playSongInAlbum(songId) {
  if (requireLogin()) return;
  if (!currentAlbumSongs.length) { playSongFromListDirect(allSongs.findIndex(s => s._id === songId)); return; }
  const idx = currentAlbumSongs.findIndex(s => s._id === songId);
  if (idx === -1) return;
  currentQueue = [...currentAlbumSongs];
  currentSongIndex = idx;
  loadAndPlay();
}

function playSongFromListDirect(idx) {
  if (requireLogin()) return;
  if (idx === -1) return;
  currentQueue = [...allSongs]; currentSongIndex = idx; loadAndPlay();
}

function showGroupedResults(raw, results) {
  document.getElementById('albumView').classList.add('hidden');
  document.getElementById('genericSearch').classList.remove('hidden');
  document.getElementById('searchResultsTitle').textContent = `Results for "${raw}"`;

  const grouped = document.getElementById('searchGrouped');
  grouped.innerHTML = '';

  const byMovie = groupBy(results, 'movieName');
  const byDirector = groupBy(results, 'musicDirector');
  const bySinger = groupByMulti(results, 'singer');
  const byLyricist = groupBy(results, 'genre'); // genre = lyricist

  const multiMovies = Object.entries(byMovie).filter(([, s]) => s.length >= 2);
  const multiMD = Object.entries(byDirector).filter(([, s]) => s.length >= 2);
  const multiSinger = Object.entries(bySinger).filter(([, s]) => s.length >= 2);
  const multiLyricist = Object.entries(byLyricist).filter(([, s]) => s.length >= 2);

  if (multiMovies.length) {
    grouped.appendChild(makeGroupSection('🎬 Movies', multiMovies.map(([name, songs]) =>
      `<div class="entity-card" onclick="triggerAlbumSearch('${esc(name)}')">
        ${songs[0]?.coverUrl ? `<img src="${songs[0].coverUrl}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;flex-shrink:0;" />` : '<span class="entity-card-icon">🎬</span>'}
        <span>${esc(name)}</span><span style="color:var(--text-muted);font-size:12px;margin-left:auto;">${songs.length} songs</span>
      </div>`).join(''), true));
  }
  if (multiMD.length) {
    grouped.appendChild(makeGroupSection('👤 Music Directors', multiMD.map(([name, songs]) =>
      `<div class="entity-card" onclick="triggerAlbumSearch('${esc(name)}')">
        <span class="entity-card-icon">👤</span>
        <span>${esc(name)}</span><span style="color:var(--text-muted);font-size:12px;margin-left:auto;">${songs.length} songs</span>
      </div>`).join(''), true));
  }
  if (multiSinger.length) {
    grouped.appendChild(makeGroupSection('👤 Singers', multiSinger.map(([name, songs]) =>
      `<div class="entity-card" onclick="triggerAlbumSearch('${esc(name)}')">
        <span class="entity-card-icon">👤</span>
        <span>${esc(name)}</span><span style="color:var(--text-muted);font-size:12px;margin-left:auto;">${songs.length} songs</span>
      </div>`).join(''), true));
  }
  if (multiLyricist.length) {
    grouped.appendChild(makeGroupSection('👤 Lyricists', multiLyricist.map(([name, songs]) =>
      `<div class="entity-card" onclick="triggerAlbumSearch('${esc(name)}')">
        <span class="entity-card-icon">👤</span>
        <span>${esc(name)}</span><span style="color:var(--text-muted);font-size:12px;margin-left:auto;">${songs.length} songs</span>
      </div>`).join(''), true));
  }

  // Songs list
  const songGroup = document.createElement('div');
  songGroup.className = 'search-group';
  songGroup.innerHTML = `<div class="search-group-title">🎵 Songs <span class="search-group-count">${results.length} found</span></div>`;
  const songList = document.createElement('div');
  songList.className = 'songs-list';
  results.forEach(song => {
    const tmp = document.createElement('div');
    tmp.innerHTML = renderSongsListItem(song);
    const el = tmp.firstChild;
    // Override onclick: open the song's movie album and highlight the clicked song
    el.setAttribute('onclick', `openMovieAlbumForSong('${song._id}')`);
    songList.appendChild(el);
  });
  songList._songsList = results;
  songGroup.appendChild(songList);
  grouped.appendChild(songGroup);
}

function groupBy(songs, field) {
  const map = {};
  songs.forEach(s => { const k = s[field] || 'Unknown'; if (!map[k]) map[k] = []; map[k].push(s); });
  return map;
}

// GroupBy for comma-separated fields like singer
function groupByMulti(songs, field) {
  const map = {};
  songs.forEach(s => {
    (s[field] || '').split(',').map(p => p.trim()).filter(Boolean).forEach(name => {
      if (!map[name]) map[name] = [];
      map[name].push(s);
    });
  });
  return map;
}

function makeGroupSection(title, cardsHTML, isEntityCards = false) {
  const div = document.createElement('div');
  div.className = 'search-group';
  div.innerHTML = `<div class="search-group-title">${title}</div>
    <div class="${isEntityCards ? 'entity-cards' : 'songs-list'}">${cardsHTML}</div>`;
  return div;
}

function triggerAlbumSearch(name) {
  const input = document.getElementById('globalSearch');
  if (input) input.value = name;
  liveSearch(name);
}

function playAlbum() {
  if (requireLogin()) return;
  if (!currentAlbumSongs.length) return;
  currentQueue = [...currentAlbumSongs]; currentSongIndex = 0; loadAndPlay();
}

function showNoResults(query) {
  document.getElementById('albumView').classList.add('hidden');
  document.getElementById('genericSearch').classList.remove('hidden');
  document.getElementById('searchResultsTitle').textContent = `Results for "${query}"`;
  document.getElementById('searchGrouped').innerHTML = `
    <div class="no-results">
      <div class="no-results-icon">🔍</div>
      <p>No songs found for "<strong>${esc(query)}</strong>"</p>
      <p style="margin-top:8px;font-size:13px;">Try searching by song name, movie, singer, or music director.</p>
    </div>`;
}

function clearSearch() {
  const input = document.getElementById('globalSearch');
  input.value = '';
  const clearBtn = document.querySelector('.search-clear-btn');
  if (clearBtn) clearBtn.classList.remove('visible');
  document.getElementById('searchResultsSection').classList.add('hidden');
  document.getElementById('albumView').classList.add('hidden');
  document.getElementById('genericSearch').classList.remove('hidden');
  document.getElementById('homeSection').classList.remove('hidden');
  currentAlbumSongs = [];
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
  localStorage.setItem('melodiaSection', name);
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById('searchResultsSection').classList.add('hidden');
  ['navLiked', 'navDownloads', 'navPlaylists', 'navAccount'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  const navMap = { liked: 'navLiked', downloads: 'navDownloads', playlists: 'navPlaylists', account: 'navAccount' };
  if (navMap[name]) document.getElementById(navMap[name])?.classList.add('active');
  const map = { home: 'homeSection', search: 'homeSection', liked: 'likedSection', downloads: 'downloadsSection', playlists: 'playlistsSection', account: 'accountSection' };
  const el = document.getElementById(map[name]);
  if (el) el.classList.remove('hidden');
  // Sync mobile bottom nav
  const mobMap = { home: 'mobHome', liked: 'mobLiked', downloads: 'mobDownloads', playlists: 'mobPlaylists', account: 'mobAccount' };
  if (mobMap[name]) setMobActive(mobMap[name]);
  if (name === 'liked') renderLikedSection();
  if (name === 'downloads') renderDownloadsSection();
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
  document.getElementById('sdTable').innerHTML = fields.filter(([, v]) => v).map(([k, v]) => `<tr><td>${k}</td><td>${esc(String(v))}</td></tr>`).join('');
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
  const newPwd = document.getElementById('newPassword').value;
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
  ['currentPassword', 'newPassword', 'confirmNewPassword'].forEach(id => document.getElementById(id).value = '');
  // Uncheck show password checkbox
  const cb = document.querySelector('input[onchange*="currentPassword"]');
  if (cb) { cb.checked = false; togglePwdGroup(['currentPassword', 'newPassword', 'confirmNewPassword'], cb); }
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
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  };
}
function closeConfirm() {
  document.getElementById('confirmModal').classList.add('hidden');
  confirmCallback = null;
}

// ===== SPACEBAR =====
document.addEventListener('keydown', function (e) {
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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===================================================================
// ===== DOWNLOADS — IndexedDB offline storage =====
// ===================================================================
const DB_NAME = 'MelodiaDownloads';
const DB_VERSION = 1;
let _db = null;

function openDownloadsDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function isDownloaded(songId) {
  try {
    const db = await openDownloadsDB();
    return new Promise(resolve => {
      const tx = db.transaction('songs', 'readonly');
      const req = tx.objectStore('songs').get(songId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  } catch { return false; }
}

async function getDownloadedSong(songId) {
  try {
    const db = await openDownloadsDB();
    return new Promise(resolve => {
      const tx = db.transaction('songs', 'readonly');
      const req = tx.objectStore('songs').get(songId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function getAllDownloads() {
  try {
    const db = await openDownloadsDB();
    return new Promise(resolve => {
      const tx = db.transaction('songs', 'readonly');
      const req = tx.objectStore('songs').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function saveDownload(songId, audioBlob, metadata) {
  const db = await openDownloadsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('songs', 'readwrite');
    tx.objectStore('songs').put({ id: songId, audioBlob, metadata, downloadedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function removeDownload(songId) {
  const db = await openDownloadsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('songs', 'readwrite');
    tx.objectStore('songs').delete(songId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function downloadSong(songId) {
  const song = allSongs.find(s => s._id === songId);
  if (!song) return;
  if (!song.audioUrl) { showToast('⚠️ No audio available to download.'); return; }

  const already = await isDownloaded(songId);
  if (already) { showToast(`"${song.songName}" is already downloaded.`); return; }

  showToast(`⬇️ Downloading "${song.songName}"...`);
  try {
    const audioRes = await fetch(song.audioUrl);
    if (!audioRes.ok) throw new Error('Failed to fetch audio');
    const audioBlob = await audioRes.blob();

    let coverBlob = null;
    if (song.coverUrl) {
      try { const r = await fetch(song.coverUrl); if (r.ok) coverBlob = await r.blob(); } catch { }
    }

    const metadata = {
      _id: song._id, songName: song.songName, movieName: song.movieName,
      singer: song.singer, musicDirector: song.musicDirector,
      movieDirector: song.movieDirector, label: song.label,
      lyrics: song.lyrics, genre: song.genre, year: song.year,
      cast: song.cast, coverBlob,
    };

    await saveDownload(songId, audioBlob, metadata);
    // Sync download IDs to cloud
    await syncDownloadsToCloud();
    showToast(`✅ "${song.songName}" downloaded!`);
    if (currentSection === 'downloads') renderDownloadsSection();
  } catch (e) {
    console.error('Download failed:', e);
    showToast('❌ Download failed. Check connection.');
  }
}

// Save list of downloaded song IDs to backend (so other devices know what to fetch)
async function syncDownloadsToCloud() {
  if (!currentUser || currentUser.isGuest) return;
  try {
    const all = await getAllDownloads();
    const ids = all.map(d => d.id);
    await fetch(`${API_BASE_URL}/users/${currentUser.id}/downloads`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ downloadedSongs: ids })
    });
  } catch (e) { /* fail silently — local data is still intact */ }
}

// On login, sync downloads from cloud — fetch any song IDs not yet in local IndexedDB
async function syncDownloadsFromCloud() {
  if (!currentUser || currentUser.isGuest) return;
  try {
    const res = await fetch(`${API_BASE_URL}/users/${currentUser.id}/downloads`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const cloudIds = data.downloadedSongs || [];
    if (!cloudIds.length) return;

    // Find which IDs are not yet downloaded on this device
    const localDownloads = await getAllDownloads();
    const localIds = new Set(localDownloads.map(d => d.id));
    const missing = cloudIds.filter(id => !localIds.has(id));

    if (!missing.length) return;
    showToast(`⬇️ Syncing ${missing.length} download${missing.length !== 1 ? 's' : ''} from cloud...`);

    // Download each missing song silently
    for (const songId of missing) {
      const song = allSongs.find(s => s._id === songId);
      if (!song || !song.audioUrl) continue;
      try {
        const audioRes = await fetch(song.audioUrl);
        if (!audioRes.ok) continue;
        const audioBlob = await audioRes.blob();
        let coverBlob = null;
        if (song.coverUrl) {
          try { const r = await fetch(song.coverUrl); if (r.ok) coverBlob = await r.blob(); } catch { }
        }
        const metadata = {
          _id: song._id, songName: song.songName, movieName: song.movieName,
          singer: song.singer, musicDirector: song.musicDirector,
          movieDirector: song.movieDirector, label: song.label,
          lyrics: song.lyrics, genre: song.genre, year: song.year,
          cast: song.cast, coverBlob,
        };
        await saveDownload(songId, audioBlob, metadata);
      } catch { }
    }
    showToast(`✅ Downloads synced!`);
    if (currentSection === 'downloads') renderDownloadsSection();
  } catch (e) { /* fail silently */ }
}

async function renderDownloadsSection() {
  const downloads = await getAllDownloads();
  const countEl = document.getElementById('downloadsCount');
  const listEl = document.getElementById('downloadsSongsList');
  if (!listEl) return;
  if (countEl) countEl.textContent = `${downloads.length} song${downloads.length !== 1 ? 's' : ''}`;

  if (!downloads.length) {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:20px 0;">No downloaded songs yet. Long-press or right-click any song to download.</div>';
    return;
  }

  listEl.innerHTML = downloads.map(d => {
    const m = d.metadata;
    const coverUrl = m.coverBlob ? URL.createObjectURL(m.coverBlob) : '';
    return `<div class="song-list-item" onclick="playDownloadedSong('${d.id}')" data-song-id="${d.id}">
      ${coverUrl ? `<img class="song-list-cover" src="${coverUrl}" alt="" />` : `<div class="song-list-cover-ph">🎵</div>`}
      <div class="song-list-meta">
        <div class="song-list-title">${esc(m.songName)}</div>
        <div class="song-list-artist">${esc(buildCreditsText(m))} • ${esc(m.movieName || '')}</div>
      </div>
      <button class="card-action-btn" title="Remove" onclick="event.stopPropagation();removeDownloadedSong('${d.id}')">🗑️</button>
    </div>`;
  }).join('');
}

async function playDownloadedSong(songId) {
  if (requireLogin()) return;
  const dl = await getDownloadedSong(songId);
  if (!dl) return;
  const audioUrl = URL.createObjectURL(dl.audioBlob);
  const coverUrl = dl.metadata.coverBlob ? URL.createObjectURL(dl.metadata.coverBlob) : '';
  const song = { ...dl.metadata, audioUrl, coverUrl, _id: songId };
  // Insert/update in currentQueue
  const existing = currentQueue.findIndex(s => s._id === songId);
  if (existing !== -1) {
    currentQueue[existing] = song;
    currentSongIndex = existing;
  } else {
    currentQueue = [song];
    currentSongIndex = 0;
  }
  loadAndPlay();
}

async function removeDownloadedSong(songId) {
  await removeDownload(songId);
  await syncDownloadsToCloud();
  showToast('Removed from downloads.');
  renderDownloadsSection();
}

function confirmClearDownloads() {
  openConfirm('🗑️ Clear All Downloads', 'Remove all downloaded songs? This cannot be undone.',
    async () => {
      const all = await getAllDownloads();
      await Promise.all(all.map(d => removeDownload(d.id)));
      renderDownloadsSection();
      showToast('All downloads cleared.');
    });
}

// When playing online, use downloaded audio if available for offline fallback
const _origLoadAndPlay = loadAndPlay;
// Override audio src resolution to prefer downloaded version
async function resolveAudioSrc(song) {
  const dl = await getDownloadedSong(song._id);
  if (dl) return URL.createObjectURL(dl.audioBlob);
  return song.audioUrl || '';
}

// ===== END DOWNLOADS =====

// Close modals on overlay click
['createPlaylistModal', 'renamePlaylistModal', 'addToPlaylistModal', 'songDetailModal', 'confirmModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });
});
const authModalEl = document.getElementById('authModal');
if (authModalEl) {
  authModalEl.addEventListener('click', function (e) {
    if (e.target === this && currentUser?.isGuest) { this.classList.add('hidden'); this.classList.remove('active'); }
  });
}