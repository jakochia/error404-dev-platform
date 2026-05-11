let trendChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadDashboardStats();
    await loadUsers();
    await loadAllPosts();
    await loadAllMemes();
    await loadAllComments();
    await loadReports();
    await loadSystemLogs();
    await loadAnalytics();
    await loadFeatureToggles();

    // Sidebar navigation
    document.querySelectorAll('.sidebar-nav a[data-section]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = link.dataset.section;
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
      });
    });

    // Logout with countdown
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showLogoutCountdown();
      });
    }

    document.getElementById('addUserForm').addEventListener('submit', addUser);
    document.getElementById('saveFeaturesBtn').addEventListener('click', saveFeatures);
    document.getElementById('searchUser')?.addEventListener('input', filterUsers);
  } catch (err) {
    console.error('Init error:', err);
    showToast('Failed to load admin panel', true);
  }
});

async function fetchAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  if (!token) { logout(); return; }
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api' + url, { ...options, headers });
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  return res;
}

// ========== DASHBOARD ==========
async function loadDashboardStats() {
  const res = await fetchAuth('/admin/stats');
  if (!res.ok) throw new Error('Stats failed');
  const stats = await res.json();
  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card"><h3>${stats.totalUsers}</h3><p>Total Users</p></div>
    <div class="stat-card"><h3>${stats.activeUsers}</h3><p>Active Users</p></div>
    <div class="stat-card"><h3>${stats.totalPosts}</h3><p>Total Posts</p></div>
    <div class="stat-card"><h3>${stats.pendingPosts}</h3><p>Pending Approval</p></div>
    <div class="stat-card"><h3>${stats.totalMemes}</h3><p>Memes</p></div>
    <div class="stat-card"><h3>${stats.openReports}</h3><p>Open Reports</p></div>
  `;
  const logsRes = await fetchAuth('/admin/logs');
  const logs = await logsRes.json();
  const recent = logs.slice(-5).reverse();
  document.getElementById('recentActivity').innerHTML = recent.map(log => `<div class="log-entry">[${new Date(log.timestamp).toLocaleString()}] ${log.action} - ${log.details}</div>`).join('');
}

// ========== USERS ==========
let allUsers = [];
async function loadUsers() {
  const res = await fetchAuth('/admin/users');
  if (!res.ok) throw new Error('Load users failed');
  allUsers = await res.json();
  renderUsers(allUsers);
}

function renderUsers(users) {
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = '';
  users.forEach(user => {
    const row = tbody.insertRow();
    row.insertCell(0).innerHTML = `<img src="${user.profilePic || '/uploads/profiles/default.png'}" width="32" style="border-radius:50%">`;
    row.insertCell(1).innerText = user.username;
    row.insertCell(2).innerText = user.email;
    row.insertCell(3).innerHTML = `<select class="role-select" data-id="${user.id}"><option ${user.role==='user'?'selected':''}>user</option><option ${user.role==='admin'?'selected':''}>admin</option></select>`;
    row.insertCell(4).innerHTML = `<span>${user.banned ? '🚫 Banned' : '✅ Active'}</span> <button class="btn-small ban-user" data-id="${user.id}">${user.banned ? 'Unban' : 'Ban'}</button>`;
    row.insertCell(5).innerText = user.xp;
    row.insertCell(6).innerHTML = `<button class="btn-small delete-user" data-id="${user.id}">🗑️ Delete</button>`;
  });
  document.querySelectorAll('.ban-user').forEach(btn => btn.addEventListener('click', () => toggleBan(btn.dataset.id)));
  document.querySelectorAll('.role-select').forEach(sel => sel.addEventListener('change', () => changeRole(sel.dataset.id, sel.value)));
  document.querySelectorAll('.delete-user').forEach(btn => btn.addEventListener('click', () => deleteUser(btn.dataset.id)));
}

function filterUsers() {
  const term = document.getElementById('searchUser').value.toLowerCase();
  const filtered = allUsers.filter(u => u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
  renderUsers(filtered);
}

async function toggleBan(userId) {
  const res = await fetchAuth(`/admin/users/${userId}/ban`, { method: 'PUT' });
  if (res.ok) { showToast('User status updated'); loadUsers(); }
  else showToast('Failed', true);
}

async function changeRole(userId, role) {
  const res = await fetchAuth(`/admin/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
  if (res.ok) showToast('Role updated');
  else showToast('Failed', true);
}

async function deleteUser(userId) {
  if (!confirm('Permanently delete this user and all their content?')) return;
  const res = await fetchAuth(`/admin/users/${userId}`, { method: 'DELETE' });
  if (res.ok) { showToast('User deleted'); loadUsers(); }
  else showToast('Delete failed', true);
}

async function addUser(e) {
  e.preventDefault();
  const username = document.getElementById('newUsername').value;
  const email = document.getElementById('newEmail').value;
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;
  const res = await fetchAuth('/admin/users', { method: 'POST', body: JSON.stringify({ username, email, password, role }) });
  if (res.ok) { showToast('User created'); loadUsers(); e.target.reset(); }
  else alert('Error');
}

// ========== POSTS & BLOGS ==========
async function loadAllPosts() {
  const res = await fetchAuth('/posts/all');
  if (!res.ok) throw new Error('Load posts failed');
  const posts = await res.json();
  const container = document.getElementById('postsList');
  container.innerHTML = '';
  posts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.innerHTML = `
      <h3>${escapeHtml(post.title)}</h3>
      <p>by ${post.authorName} | ${post.category} | ${post.approved ? '✅ Approved' : '⏳ Pending'}</p>
      <p>${escapeHtml(post.content.substring(0, 150))}...</p>
      ${!post.approved ? `<button class="btn-small approve-post" data-id="${post.id}">Approve</button>` : ''}
      <button class="btn-small delete-post" data-id="${post.id}">Delete</button>
    `;
    container.appendChild(card);
  });
  document.querySelectorAll('.approve-post').forEach(btn => btn.addEventListener('click', () => approvePost(btn.dataset.id)));
  document.querySelectorAll('.delete-post').forEach(btn => btn.addEventListener('click', () => deletePost(btn.dataset.id)));
}

async function approvePost(postId) {
  const res = await fetchAuth(`/admin/posts/${postId}/approve`, { method: 'PUT' });
  if (res.ok) { showToast('Post approved'); loadAllPosts(); }
}

async function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  const res = await fetchAuth(`/posts/${postId}`, { method: 'DELETE' });
  if (res.ok) { showToast('Post deleted'); loadAllPosts(); }
}

// ========== MEMES ==========
async function loadAllMemes() {
  const res = await fetchAuth('/memes');
  if (!res.ok) throw new Error('Load memes failed');
  const memes = await res.json();
  const container = document.getElementById('memesList');
  container.innerHTML = '';
  memes.forEach(meme => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.innerHTML = `
      <img src="${meme.url}" width="150" style="border-radius:8px">
      <p><strong>${escapeHtml(meme.title)}</strong> by ${meme.authorName}</p>
      <button class="btn-small delete-meme" data-id="${meme.id}">Delete Meme</button>
    `;
    container.appendChild(card);
  });
  document.querySelectorAll('.delete-meme').forEach(btn => btn.addEventListener('click', () => deleteMeme(btn.dataset.id)));
}

async function deleteMeme(memeId) {
  if (!confirm('Delete this meme?')) return;
  const res = await fetchAuth(`/admin/memes/${memeId}`, { method: 'DELETE' });
  if (res.ok) { showToast('Meme deleted'); loadAllMemes(); }
}

// ========== COMMENTS ==========
async function loadAllComments() {
  const res = await fetchAuth('/comments/all');
  if (!res.ok) throw new Error('Load comments failed');
  const comments = await res.json();
  const container = document.getElementById('commentsList');
  container.innerHTML = '';
  comments.forEach(comment => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <p><strong>${comment.authorName}</strong> on "${comment.postTitle}":</p>
      <p>${escapeHtml(comment.text)}</p>
      <button class="btn-small delete-comment" data-id="${comment.id}">Delete Comment</button>
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.delete-comment').forEach(btn => btn.addEventListener('click', () => deleteComment(btn.dataset.id)));
}

async function deleteComment(commentId) {
  if (!confirm('Delete this comment?')) return;
  const res = await fetchAuth(`/admin/comments/${commentId}`, { method: 'DELETE' });
  if (res.ok) { showToast('Comment deleted'); loadAllComments(); }
}

// ========== BUG REPORTS ==========
async function loadReports() {
  const res = await fetchAuth('/reports');
  if (!res.ok) throw new Error('Load reports failed');
  const reports = await res.json();
  const container = document.getElementById('reportsList');
  container.innerHTML = '';
  reports.forEach(report => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <h4>${escapeHtml(report.title)}</h4>
      <p>From: ${report.authorName} | Status: ${report.status}</p>
      <p>${escapeHtml(report.description)}</p>
      ${report.status === 'open' || report.status === 'pending' ? `<button class="btn-small resolve-report" data-id="${report.id}">Mark Resolved</button>` : ''}
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.resolve-report').forEach(btn => btn.addEventListener('click', () => resolveReport(btn.dataset.id)));
}

async function resolveReport(reportId) {
  const res = await fetchAuth(`/admin/reports/${reportId}/resolve`, { method: 'PUT' });
  if (res.ok) { showToast('Report resolved'); loadReports(); }
}

// ========== LOGS ==========
async function loadSystemLogs() {
  const res = await fetchAuth('/admin/logs');
  if (!res.ok) throw new Error('Load logs failed');
  const logs = await res.json();
  const container = document.getElementById('logsContainer');
  container.innerHTML = logs.reverse().map(log => `<div class="log-entry"><strong>[${new Date(log.timestamp).toLocaleString()}]</strong> ${log.action} — ${log.details}</div>`).join('');
}

// ========== ANALYTICS ==========
async function loadAnalytics() {
  const postsRes = await fetchAuth('/posts/all');
  const posts = await postsRes.json();
  const postsByDate = {};
  posts.forEach(p => { const date = new Date(p.createdAt).toLocaleDateString(); postsByDate[date] = (postsByDate[date] || 0) + 1; });
  const labels = Object.keys(postsByDate).slice(-7);
  const data = labels.map(l => postsByDate[l]);
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Posts Created', data, borderColor: '#00f0ff', backgroundColor: 'rgba(0,240,255,0.1)' }] } });
  const usersRes = await fetchAuth('/admin/users');
  const users = await usersRes.json();
  const topUsers = users.sort((a,b) => b.xp - a.xp).slice(0,5);
  document.getElementById('topUsers').innerHTML = topUsers.map(u => `<p>${u.username} - ${u.xp} XP</p>`).join('');
}

// ========== FEATURE TOGGLES ==========
async function loadFeatureToggles() {
  const res = await fetchAuth('/admin/config');
  if (!res.ok) throw new Error('Load config failed');
  const config = await res.json();
  document.getElementById('toggleBlogFeature').checked = config.blogEnabled;
  document.getElementById('toggleMemesFeature').checked = config.memesEnabled;
  document.getElementById('toggleChallengesFeature').checked = config.challengesEnabled;
}

async function saveFeatures() {
  const payload = {
    blogEnabled: document.getElementById('toggleBlogFeature').checked,
    memesEnabled: document.getElementById('toggleMemesFeature').checked,
    challengesEnabled: document.getElementById('toggleChallengesFeature').checked
  };
  const res = await fetchAuth('/admin/config', { method: 'PUT', body: JSON.stringify(payload) });
  if (res.ok) showToast('Features updated');
  else showToast('Update failed', true);
}

// ========== LOGOUT COUNTDOWN ==========
function showLogoutCountdown() {
  const modal = document.getElementById('logoutModal');
  const countdownSpan = document.getElementById('countdownNumber');
  let count = 3;
  modal.style.display = 'flex';
  countdownSpan.innerText = count;
  const interval = setInterval(() => {
    count--;
    countdownSpan.innerText = count;
    if (count <= 0) {
      clearInterval(interval);
      modal.style.display = 'none';
      logout();  // from common.js
    }
  }, 1000);
}

// ========== UTILITIES ==========
function escapeHtml(str) { return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }
function showToast(msg, isErr = false) {
  const toast = document.createElement('div');
  toast.innerText = msg;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.background = isErr ? '#ff004c' : '#00f0ff';
  toast.style.color = '#0b0f1a';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.zIndex = '9999';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}