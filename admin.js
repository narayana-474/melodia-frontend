// ===================================================================
// MELODIA — ADMIN PANEL JavaScript
// ===================================================================
// ── Auto-detect backend URL ──────────────────────────────────────────
// • On localhost → use local Node server
// • On any deployed domain → use your Render/Railway/etc. backend URL
//   👇 Replace this with your actual deployed backend URL
const DEPLOYED_BACKEND_URL = 'https://melodia-backend-5f8g.onrender.com/api';

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : DEPLOYED_BACKEND_URL;
// ===================================================================

let adminToken = null;
let allAdminSongs = [];
let allAdminUsers = [];
let currentViewUserId = null;

// ===== TOGGLE PASSWORD =====
function togglePwd(inputId, checkbox) {
  const input = document.getElementById(inputId);
  if (input) input.type = checkbox.checked ? 'text' : 'password';
}

// ===== ADMIN LOGIN =====
async function adminLogin() {
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  if (!email || !password) return adminErr('Please enter credentials.');
  try {
    const res = await fetch(`${API_BASE_URL}/auth/admin-login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) return adminErr(data.message || 'Invalid admin credentials.');
    adminToken = data.token;
    localStorage.setItem('rhythmAdminToken', adminToken);
    startAdminApp();
  } catch {
    adminErr('Cannot connect to server. Make sure node server.js is running.');
  }
}

function adminErr(msg) {
  const el = document.getElementById('adminLoginError');
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 5000);
}

// Auto-logout when token has expired
function handleAuthError(status) {
  if (status === 401 || status === 403) {
    showAdminToast('⚠️ Session expired. Please log in again.');
    setTimeout(() => {
      adminToken = null;
      localStorage.removeItem('rhythmAdminToken');
      location.reload();
    }, 1500);
    return true;
  }
  return false;
}

function adminLogout() {
  adminToken = null;
  localStorage.removeItem('rhythmAdminToken');
  location.reload();
}

function startAdminApp() {
  document.getElementById('adminLoginOverlay').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
  loadAdminSongs();
  loadAdminUsers();
}

window.onload = () => {
  const saved = localStorage.getItem('rhythmAdminToken');
  if (saved && saved === 'demo-admin-token') {
    localStorage.removeItem('rhythmAdminToken');
    return;
  }
  if (saved) { adminToken = saved; startAdminApp(); }
};

// ===== SECTION SWITCH =====
function adminSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const map = { upload: 'adminUpload', manage: 'adminManage', users: 'adminUsers', settings: 'adminSettings' };
  document.getElementById(map[name])?.classList.remove('hidden');
  event?.target?.closest('.nav-link')?.classList.add('active');
  if (name === 'manage') renderAdminSongsTable(allAdminSongs);
  if (name === 'users') loadAdminUsers();
}

// ===== UPLOAD SONG =====
function previewCover(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('coverPreview').classList.add('hidden');
    const img = document.getElementById('coverPreviewImg');
    img.src = e.target.result; img.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function previewAudio(input) {
  const file = input.files[0]; if (!file) return;
  document.getElementById('audioPreview').classList.add('hidden');
  const el = document.getElementById('audioFileName');
  el.textContent = '🎵 ' + file.name; el.classList.remove('hidden');
}

async function uploadSong() {
  const songName = document.getElementById('uSongName').value.trim();
  const movieName = document.getElementById('uMovieName').value.trim();
  const singer = document.getElementById('uSinger').value.trim();
  if (!songName || !movieName || !singer) return showUploadStatus('error', 'Song Name, Movie, and Singer are required.');
  const coverFile = document.getElementById('coverFile').files[0];
  const audioFile = document.getElementById('audioFile').files[0];
  setUploadLoading(true);
  try {
    const formData = new FormData();
    formData.append('songName', songName);
    formData.append('movieName', movieName);
    formData.append('cast_members', document.getElementById('uCast').value.trim());
    formData.append('singer', singer);
    formData.append('musicDirector', document.getElementById('uMusicDirector').value.trim());
    formData.append('movieDirector', document.getElementById('uMovieDirector').value.trim());
    formData.append('label', document.getElementById('uLabel').value.trim());
    formData.append('lyrics', document.getElementById('uLyrics').value.trim());
    formData.append('genre', document.getElementById('uGenre').value.trim());
    formData.append('year', document.getElementById('uYear').value);
    formData.append('song_category', document.getElementById('uCategory').value.trim());
    formData.append('song_language', document.getElementById('uLanguage').value.trim());
    if (coverFile) formData.append('cover', coverFile);
    if (audioFile) formData.append('audio', audioFile);
    const res = await fetch(`${API_BASE_URL}/songs`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` }, body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showUploadStatus('success', `✅ "${songName}" uploaded successfully!`);
    clearUploadForm(); loadAdminSongs();
  } catch {
    const songs = JSON.parse(localStorage.getItem('rhythmSongs') || '[]');
    const coverUrl = coverFile ? await fileToDataURL(coverFile) : '';
    const audioUrl = audioFile ? await fileToDataURL(audioFile) : '';
    const castValue = document.getElementById('uCast').value.trim();
    const newSong = {
      _id: Date.now().toString(), songName, movieName,
      cast_members: castValue, cast: castValue, singer,
      musicDirector: document.getElementById('uMusicDirector').value.trim(),
      movieDirector: document.getElementById('uMovieDirector').value.trim(),
      label: document.getElementById('uLabel').value.trim(),
      lyrics: document.getElementById('uLyrics').value.trim(),
      genre: document.getElementById('uGenre').value.trim(),
      year: document.getElementById('uYear').value,
      song_category: document.getElementById('uCategory').value.trim(),
      song_language: document.getElementById('uLanguage').value.trim(),
      coverUrl, audioUrl, createdAt: new Date().toISOString()
    };
    songs.push(newSong);
    localStorage.setItem('rhythmSongs', JSON.stringify(songs));
    showUploadStatus('success', `✅ "${songName}" saved (demo mode)!`);
    clearUploadForm(); allAdminSongs = songs;
  }
  setUploadLoading(false);
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result); r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function setUploadLoading(loading) {
  document.getElementById('uploadBtnText').style.display = loading ? 'none' : '';
  document.getElementById('uploadSpinner').classList.toggle('hidden', !loading);
}

function showUploadStatus(type, msg) {
  const el = document.getElementById('uploadStatus');
  el.className = 'upload-status ' + type; el.textContent = msg;
  setTimeout(() => { el.textContent = ''; el.className = 'upload-status'; }, 5000);
}

function clearUploadForm() {
  ['uSongName', 'uMovieName', 'uCast', 'uSinger', 'uMusicDirector', 'uMovieDirector', 'uLabel', 'uLyrics', 'uYear', 'uGenre'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('uCategory').value = '';
  document.getElementById('uLanguage').value = '';
  document.getElementById('coverFile').value = '';
  document.getElementById('audioFile').value = '';
  document.getElementById('coverPreview').classList.remove('hidden');
  document.getElementById('coverPreviewImg').classList.add('hidden');
  document.getElementById('audioPreview').classList.remove('hidden');
  document.getElementById('audioFileName').classList.add('hidden');
}

// ===== MANAGE SONGS =====
function normalizeSong(s) {
  return {
    ...s,
    cast_members: s.cast_members || s.cast || '',
    song_category: s.song_category || '',
    song_language: s.song_language || '',
  };
}

async function loadAdminSongs() {
  try {
    const res = await fetch(`${API_BASE_URL}/songs`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    allAdminSongs = (data.songs || data || []).map(normalizeSong);
  } catch {
    allAdminSongs = JSON.parse(localStorage.getItem('rhythmSongs') || '[]').map(normalizeSong);
  }
  renderAdminSongsTable(allAdminSongs);
}

function renderAdminSongsTable(songs) {
  const tbody = document.getElementById('adminSongsTableBody');
  if (!tbody) return;
  if (!songs.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#555;padding:32px;">No songs uploaded yet.</td></tr>'; return; }
  tbody.innerHTML = songs.map(s => `
    <tr>
      <td>${s.coverUrl ? `<img class="admin-cover-thumb" src="${s.coverUrl}" alt="" />` : '🎵'}</td>
      <td style="font-weight:600;color:#f0f0f5;">${esc(s.songName)}</td>
      <td>${esc(s.movieName)}</td>
      <td>${esc(s.singer)}</td>
      <td style="color:#b0b0c0;">${esc(s.genre || '—')}</td>
      <td>${s.year || '—'}</td>
      <td><div class="actions-cell">
        <button class="admin-action-btn edit" onclick="openEditModal('${s._id}')">✏️ Edit</button>
        <button class="admin-action-btn delete" onclick="confirmAdminDelete('song','${s._id}','${esc(s.songName)}')">🗑️ Delete</button>
      </div></td>
    </tr>`).join('');
}

function adminSearchSongs(query) {
  query = query.toLowerCase();
  renderAdminSongsTable(allAdminSongs.filter(s =>
    s.songName?.toLowerCase().includes(query) || s.singer?.toLowerCase().includes(query) ||
    s.movieName?.toLowerCase().includes(query) || s.cast_members?.toLowerCase().includes(query) ||
    s.musicDirector?.toLowerCase().includes(query)
  ));
}

// ===== EDIT SONG =====
function openEditModal(id) {
  const song = allAdminSongs.find(s => s._id === id); if (!song) return;
  document.getElementById('editSongId').value = id;
  document.getElementById('editSongName').value = song.songName || '';
  document.getElementById('editMovieName').value = song.movieName || '';
  document.getElementById('editCast').value = song.cast_members || song.cast || '';
  document.getElementById('editSinger').value = song.singer || '';
  document.getElementById('editMusicDirector').value = song.musicDirector || '';
  document.getElementById('editMovieDirector').value = song.movieDirector || '';
  document.getElementById('editLabel').value = song.label || '';
  document.getElementById('editGenre').value = song.genre || '';
  document.getElementById('editYear').value = song.year || '';
  document.getElementById('editCategory').value = song.song_category || '';
  document.getElementById('editLanguage').value = song.song_language || '';
  document.getElementById('editLyrics').value = song.lyrics || '';
  document.getElementById('editSongModal').classList.remove('hidden');
}

function closeEditModal() { document.getElementById('editSongModal').classList.add('hidden'); }

async function saveEditSong() {
  const id = document.getElementById('editSongId').value;
  const castValue = document.getElementById('editCast').value.trim();
  const updated = {
    songName: document.getElementById('editSongName').value.trim(),
    movieName: document.getElementById('editMovieName').value.trim(),
    cast_members: castValue, cast: castValue,
    singer: document.getElementById('editSinger').value.trim(),
    musicDirector: document.getElementById('editMusicDirector').value.trim(),
    movieDirector: document.getElementById('editMovieDirector').value.trim(),
    label: document.getElementById('editLabel').value.trim(),
    genre: document.getElementById('editGenre').value.trim(),
    year: document.getElementById('editYear').value,
    song_category: document.getElementById('editCategory').value.trim(),
    song_language: document.getElementById('editLanguage').value.trim(),
    lyrics: document.getElementById('editLyrics').value.trim(),
  };
  try {
    const res = await fetch(`${API_BASE_URL}/songs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(updated)
    });
    const data = await res.json();
    if (!res.ok) {
      // Auto-logout on expired token (401)
      if (handleAuthError(res.status)) { closeEditModal(); return; }
      showAdminToast(`❌ Error: ${data.message || 'Update failed. Check Supabase columns exist.'}`);
      console.error('saveEditSong API error:', data.message);
      closeEditModal();
      return;
    }
    showAdminToast('✅ Song updated successfully!');
    closeEditModal();
    loadAdminSongs();
  } catch (e) {
    // Network error — server unreachable, use localStorage fallback
    console.warn('saveEditSong network error, using localStorage:', e.message);
    const songs = JSON.parse(localStorage.getItem('rhythmSongs') || '[]');
    const idx = songs.findIndex(s => s._id === id);
    if (idx !== -1) {
      songs[idx] = { ...songs[idx], ...updated };
      localStorage.setItem('rhythmSongs', JSON.stringify(songs));
    }
    showAdminToast('⚠️ Server unreachable — saved locally (demo mode).');
    closeEditModal();
    loadAdminSongs();
  }
}

async function deleteSong(id) {
  try {
    await fetch(`${API_BASE_URL}/songs/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
  } catch {
    const songs = JSON.parse(localStorage.getItem('rhythmSongs') || '[]');
    localStorage.setItem('rhythmSongs', JSON.stringify(songs.filter(s => s._id !== id)));
  }
  loadAdminSongs();
}

// ===== MANAGE USERS =====
async function loadAdminUsers() {
  const tbody = document.getElementById('adminUsersTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:32px;">⏳ Loading users...</td></tr>';
  try {
    const res = await fetch(`${API_BASE_URL}/users`, {
      method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#ff3f6c;padding:32px;">Session expired. Please <button onclick="adminLogout()" style="color:#ff3f6c;background:none;border:none;cursor:pointer;text-decoration:underline;">logout and login again</button>.</td></tr>`;
        return;
      }
      throw new Error(data.message);
    }
    allAdminUsers = data.users || [];
    console.log(`✅ Loaded ${allAdminUsers.length} users`);
  } catch (e) {
    console.warn('API failed, using localStorage:', e.message);
    allAdminUsers = JSON.parse(localStorage.getItem('rhythmUsers') || '[]');
  }
  renderUsersTable(allAdminUsers);
  updateAdminStats();
}

function renderUsersTable(users) {
  const tbody = document.getElementById('adminUsersTableBody');
  if (!tbody) return;
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#555;padding:32px;">No registered users.</td></tr>'; return; }
  tbody.innerHTML = users.map(u => {
    const uid = u.id || u._id;
    const joinedDate = u.created_at || u.createdAt;
    const dateStr = joinedDate ? new Date(joinedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const likedArr = Array.isArray(u.liked_songs) ? u.liked_songs : JSON.parse(localStorage.getItem(`liked_${uid}`) || '[]');
    const playlistArr = Array.isArray(u.playlists) ? u.playlists : JSON.parse(localStorage.getItem(`playlists_${uid}`) || '[]');
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;"><span class="user-avatar">${(u.name || '?')[0].toUpperCase()}</span><span style="font-weight:600;color:#f0f0f5;">${esc(u.name)}</span></div></td>
      <td style="color:#888899;">${esc(u.email)}</td>
      <td style="color:#888899;font-size:13px;">${dateStr}</td>
      <td style="color:#ff8fa3;font-weight:600;">${likedArr.length}</td>
      <td style="color:#a78bfa;font-weight:600;">${playlistArr.length}</td>
      <td><div class="actions-cell">
        <button class="admin-action-btn edit" onclick="viewUserDetail('${uid}')">👁 View</button>
        <button class="admin-action-btn delete" onclick="confirmAdminDelete('user','${uid}','${esc(u.name)}')">🗑️ Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

function adminSearchUsers(query) {
  query = query.toLowerCase();
  renderUsersTable(allAdminUsers.filter(u => u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query)));
}

function updateAdminStats() {
  document.getElementById('statTotalUsers').textContent = allAdminUsers.length;
  document.getElementById('statTotalSongs').textContent = allAdminSongs.length || JSON.parse(localStorage.getItem('rhythmSongs') || '[]').length;
  let totalLikes = 0, totalPlaylists = 0;
  allAdminUsers.forEach(u => {
    const uid = u.id || u._id;
    totalLikes += (Array.isArray(u.liked_songs) ? u.liked_songs : JSON.parse(localStorage.getItem(`liked_${uid}`) || '[]')).length;
    totalPlaylists += (Array.isArray(u.playlists) ? u.playlists : JSON.parse(localStorage.getItem(`playlists_${uid}`) || '[]')).length;
  });
  document.getElementById('statTotalLikes').textContent = totalLikes;
  document.getElementById('statTotalPlaylists').textContent = totalPlaylists;
}

function viewUserDetail(uid) {
  const user = allAdminUsers.find(u => (u.id || u._id) === uid); if (!user) return;
  currentViewUserId = uid;
  document.getElementById('udAvatar').textContent = (user.name || '?')[0].toUpperCase();
  document.getElementById('udName').textContent = user.name;
  document.getElementById('udEmail').textContent = user.email;
  const joinedDate = user.created_at || user.createdAt;
  document.getElementById('udJoined').textContent = joinedDate ? `Joined: ${new Date(joinedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}` : '';
  const likedArr = Array.isArray(user.liked_songs) ? user.liked_songs : JSON.parse(localStorage.getItem(`liked_${uid}`) || '[]');
  const playlistArr = Array.isArray(user.playlists) ? user.playlists : JSON.parse(localStorage.getItem(`playlists_${uid}`) || '[]');
  document.getElementById('udLiked').textContent = likedArr.length;
  document.getElementById('udPlaylists').textContent = playlistArr.length;
  document.getElementById('userDetailModal').classList.remove('hidden');
}

function closeUserDetail() { document.getElementById('userDetailModal').classList.add('hidden'); currentViewUserId = null; }

async function adminDeleteUser(uid) {
  closeUserDetail();
  confirmAdminDelete('user', uid, allAdminUsers.find(u => (u.id || u._id) === uid)?.name || 'this user');
}

function confirmAdminDelete(type, id, name) {
  const title = type === 'song' ? '🗑️ Delete Song' : '🗑️ Delete User';
  const msg = type === 'song'
    ? `Permanently delete "${name}"? This cannot be undone.`
    : `Permanently delete the account of "${name}"? All their data will be removed. This cannot be undone.`;
  document.getElementById('adminConfirmTitle').textContent = title;
  document.getElementById('adminConfirmMsg').textContent = msg;
  document.getElementById('adminConfirmYesBtn').onclick = async () => {
    closeAdminConfirm();
    if (type === 'song') await deleteSong(id);
    else await deleteUserById(id);
  };
  document.getElementById('adminConfirmModal').classList.remove('hidden');
}

function closeAdminConfirm() { document.getElementById('adminConfirmModal').classList.add('hidden'); }

async function deleteUserById(uid) {
  try {
    await fetch(`${API_BASE_URL}/users/${uid}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
  } catch {
    const users = JSON.parse(localStorage.getItem('rhythmUsers') || '[]');
    localStorage.setItem('rhythmUsers', JSON.stringify(users.filter(u => (u.id || u._id) !== uid)));
    localStorage.removeItem(`liked_${uid}`);
    localStorage.removeItem(`playlists_${uid}`);
  }
  loadAdminUsers();
}

// ===== SETTINGS — CHANGE ADMIN CREDENTIALS =====
async function changeAdminEmail() {
  const currentEmail = document.getElementById('currentAdminEmail').value.trim();
  const newEmail = document.getElementById('newAdminEmail').value.trim();
  const password = document.getElementById('emailChangePassword').value;
  const msgEl = document.getElementById('emailChangeMsg');

  if (!currentEmail || !newEmail || !password) {
    return showSettingsMsg('emailChangeMsg', '❌ Please fill all fields.', 'error');
  }
  if (!/\S+@\S+\.\S+/.test(newEmail)) {
    return showSettingsMsg('emailChangeMsg', '❌ Please enter a valid email address.', 'error');
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/change-admin-credentials`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ type: 'email', currentEmail, newEmail, password })
    });
    const data = await res.json();
    if (!res.ok) return showSettingsMsg('emailChangeMsg', `❌ ${data.message}`, 'error');
    showSettingsMsg('emailChangeMsg', '✅ Email updated! Update your .env file and restart server.', 'success');
    document.getElementById('currentAdminEmail').value = '';
    document.getElementById('newAdminEmail').value = '';
    document.getElementById('emailChangePassword').value = '';
  } catch {
    showSettingsMsg('emailChangeMsg', '❌ Server error. Please try again.', 'error');
  }
}

async function changeAdminPassword() {
  const currentPwd = document.getElementById('currentAdminPassword').value;
  const newPwd = document.getElementById('newAdminPassword').value;
  const confirmPwd = document.getElementById('confirmAdminPassword').value;

  if (!currentPwd || !newPwd || !confirmPwd) {
    return showSettingsMsg('passwordChangeAdminMsg', '❌ Please fill all fields.', 'error');
  }
  if (newPwd.length < 6) {
    return showSettingsMsg('passwordChangeAdminMsg', '❌ New password must be at least 6 characters.', 'error');
  }
  if (newPwd !== confirmPwd) {
    return showSettingsMsg('passwordChangeAdminMsg', '❌ Passwords do not match.', 'error');
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/change-admin-credentials`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ type: 'password', currentPassword: currentPwd, newPassword: newPwd })
    });
    const data = await res.json();
    if (!res.ok) return showSettingsMsg('passwordChangeAdminMsg', `❌ ${data.message}`, 'error');
    showSettingsMsg('passwordChangeAdminMsg', '✅ Password updated! Update your .env file and restart server.', 'success');
    document.getElementById('currentAdminPassword').value = '';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('confirmAdminPassword').value = '';
  } catch {
    showSettingsMsg('passwordChangeAdminMsg', '❌ Server error. Please try again.', 'error');
  }
}

function showSettingsMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'success' ? '#4ade80' : '#ff3f6c';
  setTimeout(() => { el.textContent = ''; }, 5000);
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ===== TOP-RIGHT ADMIN MENU =====
function toggleAdminMenu() {
  const dropdown = document.getElementById('adminMenuDropdown');
  const backdrop = document.getElementById('adminMenuBackdrop');
  const isOpen = !dropdown.classList.contains('hidden');
  dropdown.classList.toggle('hidden', isOpen);
  backdrop.classList.toggle('hidden', isOpen);
}
function closeAdminMenu() {
  document.getElementById('adminMenuDropdown')?.classList.add('hidden');
  document.getElementById('adminMenuBackdrop')?.classList.add('hidden');
}

function showAdminToast(msg) {
  const existing = document.querySelector('.admin-toast'); if (existing) existing.remove();
  const t = document.createElement('div'); t.className = 'admin-toast'; t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1e2e;border:1px solid #2a2a3a;color:#f0f0f5;padding:11px 24px;border-radius:50px;font-size:13px;font-weight:500;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.5);animation:slideUp 0.3s ease;white-space:nowrap;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

['editSongModal', 'userDetailModal', 'adminConfirmModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });
});
