// ===================================================================
// MELODIA — ADMIN PANEL JavaScript
// ===================================================================
const API_BASE_URL = 'https://melodia-backend-5f8g.onrender.com/api';
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
  if (name === 'users')  loadAdminUsers();
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
  ['uSongName','uMovieName','uCast','uSinger','uMusicDirector','uMovieDirector','uLabel','uLyrics','uYear','uGenre'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('coverFile').value = '';
  document.getElementById('audioFile').value = '';
  document.getElementById('coverPreview').classList.remove('hidden');
  document.getElementById('coverPreviewImg').classList.add('hidden');
  document.getElementById('audioPreview').classList.remove('hidden');
  document.getElementById('audioFileName').classList.add('hidden');
}

// ===== MANAGE SONGS =====
function normalizeSong(s) { return { ...s, cast_members: s.cast_members || s.cast || '' }; }

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
    lyrics: document.getElementById('editLyrics').value.trim(),
  };
  try {
    const res = await fetch(`${API_BASE_URL}/songs/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(updated)
    });
    if (!res.ok) throw new Error();
    showAdminToast('✅ Song updated successfully!');
  } catch {
    const songs = JSON.parse(localStorage.getItem('rhythmSongs') || '[]');
    const idx = songs.findIndex(s => s._id === id);
    if (idx !== -1) { songs[idx] = { ...songs[idx], ...updated }; localStorage.setItem('rhythmSongs', JSON.stringify(songs)); }
    showAdminToast('✅ Song updated (demo mode)!');
  }
  closeEditModal(); loadAdminSongs();
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
    const dateStr = joinedDate ? new Date(joinedDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const likedArr = Array.isArray(u.liked_songs) ? u.liked_songs : JSON.parse(localStorage.getItem(`liked_${uid}`) || '[]');
    const playlistArr = Array.isArray(u.playlists) ? u.playlists : JSON.parse(localStorage.getItem(`playlists_${uid}`) || '[]');
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;"><span class="user-avatar">${(u.name||'?')[0].toUpperCase()}</span><span style="font-weight:600;color:#f0f0f5;">${esc(u.name)}</span></div></td>
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
  document.getElementById('udAvatar').textContent = (user.name||'?')[0].toUpperCase();
  document.getElementById('udName').textContent = user.name;
  document.getElementById('udEmail').textContent = user.email;
  const joinedDate = user.created_at || user.createdAt;
  document.getElementById('udJoined').textContent = joinedDate ? `Joined: ${new Date(joinedDate).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })}` : '';
  const likedArr = Array.isArray(user.liked_songs) ? user.liked_songs : JSON.parse(localStorage.getItem(`liked_${uid}`) || '[]');
  const playlistArr = Array.isArray(user.playlists) ? user.playlists : JSON.parse(localStorage.getItem(`playlists_${uid}`) || '[]');
  document.getElementById('udLiked').textContent = likedArr.length;
  document.getElementById('udPlaylists').textContent = playlistArr.length;
  document.getElementById('userDetailModal').classList.remove('hidden');
}

function closeUserDetail() { document.getElementById('userDetailModal').classList.add('hidden'); currentViewUserId = null; }

async function adminDeleteUser(uid) {
  closeUserDetail();
  confirmAdminDelete('user', uid, allAdminUsers.find(u => (u.id||u._id) === uid)?.name || 'this user');
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
    localStorage.setItem('rhythmUsers', JSON.stringify(users.filter(u => (u.id||u._id) !== uid)));
    localStorage.removeItem(`liked_${uid}`);
    localStorage.removeItem(`playlists_${uid}`);
  }
  loadAdminUsers();
}

// ===== SETTINGS — CHANGE ADMIN CREDENTIALS =====
async function changeAdminEmail() {
  const currentEmail = document.getElementById('currentAdminEmail').value.trim();
  const newEmail     = document.getElementById('newAdminEmail').value.trim();
  const password     = document.getElementById('emailChangePassword').value;
  const msgEl        = document.getElementById('emailChangeMsg');

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
  const newPwd     = document.getElementById('newAdminPassword').value;
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
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== UPLOAD TAB SWITCHING =====
function switchUploadTab(tab) {
  document.getElementById('manualUploadPanel').classList.toggle('hidden', tab !== 'manual');
  document.getElementById('csvUploadPanel').classList.toggle('hidden', tab !== 'csv');
  document.getElementById('tabManual').classList.toggle('active', tab === 'manual');
  document.getElementById('tabCsv').classList.toggle('active', tab === 'csv');
}

// ===== CSV BULK UPLOAD =====
let parsedCsvRows = [];

function downloadCsvTemplate() {
  const headers = 'songName,movieName,singer,audioUrl,musicDirector,movieDirector,cast,lyricist,label,year,coverUrl,lyrics';
  const example = 'Kesariya,Brahmastra,Arijit Singh,https://res.cloudinary.com/your-cloud/video/upload/song.mp3,Pritam,Ayan Mukerji,Ranbir Kapoor,Amitabh Bhattacharya,Sony Music,2022,https://res.cloudinary.com/your-cloud/image/upload/cover.jpg,';
  const csv = headers + '\n' + example;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'melodia_bulk_upload_template.csv';
  a.click(); URL.revokeObjectURL(url);
}

function previewCsv(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.name.endsWith('.csv')) {
    showCsvStatus('error', '❌ Please upload a .csv file only.');
    return;
  }
  // Show file name
  document.getElementById('csvPreviewEmpty').classList.add('hidden');
  const fn = document.getElementById('csvFileName');
  fn.textContent = '📊 ' + file.name; fn.classList.remove('hidden');

  const reader = new FileReader();
  reader.onload = e => parseCsvContent(e.target.result);
  reader.readAsText(file);
}

function parseCsvContent(text) {
  // Split into lines, handle Windows \r\n
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) { showCsvStatus('error', '❌ CSV must have a header row and at least one data row.'); return; }

  // Parse header
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());

  // Required fields
  const required = ['songname', 'moviename', 'singer', 'audiourl'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) {
    showCsvStatus('error', `❌ Missing required columns: ${missing.join(', ')}`);
    return;
  }

  parsedCsvRows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });

    const rowErrors = [];
    if (!row.songname)  rowErrors.push('Song Name missing');
    if (!row.moviename) rowErrors.push('Movie Name missing');
    if (!row.singer)    rowErrors.push('Singer missing');
    if (!row.audiourl)  rowErrors.push('Audio URL missing');
    else if (!row.audiourl.startsWith('http')) rowErrors.push('Audio URL invalid');

    parsedCsvRows.push({ row, errors: rowErrors, line: i });
    if (rowErrors.length) errors.push(`Row ${i}: ${rowErrors.join(', ')}`);
  }

  renderCsvPreview(errors);
}

// Proper CSV line parser (handles quoted fields with commas)
function parseCsvLine(line) {
  const result = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function renderCsvPreview(errors) {
  const tbody = document.getElementById('csvPreviewBody');
  const validRows = parsedCsvRows.filter(r => r.errors.length === 0);
  const invalidRows = parsedCsvRows.filter(r => r.errors.length > 0);

  document.getElementById('csvRowCount').textContent = validRows.length + ' valid';
  document.getElementById('csvErrorCount').textContent = invalidRows.length ? `• ${invalidRows.length} with errors (will be skipped)` : '';
  document.getElementById('csvPreviewWrap').classList.remove('hidden');

  tbody.innerHTML = parsedCsvRows.map((item, i) => {
    const r = item.row;
    const ok = item.errors.length === 0;
    return `<tr style="${ok ? '' : 'opacity:0.5;'}">
      <td style="color:#555566;">${item.line}</td>
      <td style="font-weight:600;color:#f0f0f5;">${esc(r.songname || '—')}</td>
      <td>${esc(r.moviename || '—')}</td>
      <td>${esc(r.singer || '—')}</td>
      <td>${esc(r.year || '—')}</td>
      <td style="font-size:11px;color:#555566;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${r.audiourl ? `<a href="${esc(r.audiourl)}" target="_blank" style="color:#a78bfa;">🔗 Link</a>` : '—'}
      </td>
      <td>${ok
        ? '<span style="color:#4ade80;font-size:12px;">✓ Ready</span>'
        : `<span style="color:#ff3f6c;font-size:11px;" title="${esc(item.errors.join(', '))}">⚠ ${esc(item.errors[0])}</span>`
      }</td>
    </tr>`;
  }).join('');

  // Enable button only if there are valid rows
  const btn = document.getElementById('csvUploadBtn');
  btn.disabled = validRows.length === 0;
  if (validRows.length > 0) {
    document.getElementById('csvUploadBtnText').textContent = `📊 Upload ${validRows.length} Song${validRows.length !== 1 ? 's' : ''}`;
  }
}

async function uploadCsvSongs() {
  const validRows = parsedCsvRows.filter(r => r.errors.length === 0);
  if (!validRows.length) return;

  document.getElementById('csvUploadBtnText').style.display = 'none';
  document.getElementById('csvUploadSpinner').classList.remove('hidden');
  document.getElementById('csvUploadBtn').disabled = true;

  let successCount = 0, failCount = 0;

  for (const item of validRows) {
    const r = item.row;
    try {
      // Build payload matching the existing API format
      const payload = {
        songName:      r.songname,
        movieName:     r.moviename,
        singer:        r.singer,
        audioUrl:      r.audiourl,
        coverUrl:      r.coverurl || '',
        musicDirector: r.musicdirector || '',
        movieDirector: r.moviedirector || '',
        cast_members:  r.cast || '',
        genre:         r.lyricist || '',
        label:         r.label || '',
        year:          r.year ? parseInt(r.year) : null,
        lyrics:        r.lyrics || '',
      };

      const res = await fetch(`${API_BASE_URL}/songs/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify(payload)
      });

      if (res.ok) { successCount++; }
      else { failCount++; }
    } catch {
      // Fallback: save to localStorage
      try {
        const songs = JSON.parse(localStorage.getItem('rhythmSongs') || '[]');
        const r2 = item.row;
        songs.push({
          _id: Date.now().toString() + Math.random().toString(36).slice(2),
          songName: r2.songname, movieName: r2.moviename, singer: r2.singer,
          audioUrl: r2.audiourl, coverUrl: r2.coverurl || '',
          musicDirector: r2.musicdirector || '', movieDirector: r2.moviedirector || '',
          cast_members: r2.cast || '', cast: r2.cast || '',
          genre: r2.lyricist || '', label: r2.label || '',
          year: r2.year || '', lyrics: r2.lyrics || '',
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('rhythmSongs', JSON.stringify(songs));
        successCount++;
      } catch { failCount++; }
    }
  }

  document.getElementById('csvUploadBtnText').style.display = '';
  document.getElementById('csvUploadSpinner').classList.add('hidden');

  const statusMsg = successCount > 0
    ? `✅ ${successCount} song${successCount !== 1 ? 's' : ''} uploaded successfully!${failCount ? ` (${failCount} failed)` : ''}`
    : `❌ All uploads failed. Check your connection.`;
  showCsvStatus(successCount > 0 ? 'success' : 'error', statusMsg);

  if (successCount > 0) {
    loadAdminSongs();
    setTimeout(() => clearCsvForm(), 3000);
  }

  document.getElementById('csvUploadBtn').disabled = false;
}

function showCsvStatus(type, msg) {
  const el = document.getElementById('csvUploadStatus');
  el.className = 'upload-status ' + type; el.textContent = msg;
  setTimeout(() => { el.textContent = ''; el.className = 'upload-status'; }, 6000);
}

function clearCsvForm() {
  parsedCsvRows = [];
  document.getElementById('csvFile').value = '';
  document.getElementById('csvFileName').classList.add('hidden');
  document.getElementById('csvPreviewEmpty').classList.remove('hidden');
  document.getElementById('csvPreviewWrap').classList.add('hidden');
  document.getElementById('csvPreviewBody').innerHTML = '';
  document.getElementById('csvUploadBtn').disabled = true;
  document.getElementById('csvUploadBtnText').textContent = '📊 Upload All Songs';
  document.getElementById('csvUploadStatus').textContent = '';
  document.getElementById('csvUploadStatus').className = 'upload-status';
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

['editSongModal','userDetailModal','adminConfirmModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });
});