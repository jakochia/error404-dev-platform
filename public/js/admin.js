let trendChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadDashboardStats();
    await loadUsers();
    await loadAllPosts();
    await loadAllMemes();
    await loadAllComments();
    await loadReports();
    await loadFeedback();
    await loadGroups();
    await loadAnnouncements();
    await loadSystemLogs();
    await loadAnalytics();
    await loadFeatureToggles();

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

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      showLogoutCountdown();
    });
    document.getElementById('addUserForm')?.addEventListener('submit', addUser);
    document.getElementById('saveFeaturesBtn')?.addEventListener('click', saveFeatures);
    document.getElementById('searchUser')?.addEventListener('input', filterUsers);
    document.getElementById('createGroupBtn')?.addEventListener('click', createGroup);
    document.getElementById('createAnnouncementBtn')?.addEventListener('click', createAnnouncement);
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

// ========== POSTS ==========
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

// ========== REPORTS ==========
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
      ${report.status === 'pending' ? `<button class="btn-small resolve-report" data-id="${report.id}">Mark Resolved</button>` : ''}
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.resolve-report').forEach(btn => btn.addEventListener('click', () => resolveReport(btn.dataset.id)));
}
async function resolveReport(reportId) {
  const res = await fetchAuth(`/admin/reports/${reportId}/resolve`, { method: 'PUT' });
  if (res.ok) { showToast('Report resolved'); loadReports(); }
}

// ========== FEEDBACK ==========
async function loadFeedback() {
  const res = await fetchAuth('/admin/feedback');
  if (!res.ok) throw new Error('Load feedback failed');
  const feedbacks = await res.json();
  const container = document.getElementById('feedbackList');
  container.innerHTML = '';
  feedbacks.forEach(f => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <p><strong>${escapeHtml(f.username)}</strong> (Rating: ${f.rating}/5)</p>
      <p>${escapeHtml(f.message)}</p>
      ${f.adminReply ? `<p><em>Admin reply: ${escapeHtml(f.adminReply)}</em></p>` : `
        <textarea id="reply-${f.id}" placeholder="Write your reply..."></textarea>
        <button class="btn-small reply-feedback" data-id="${f.id}">Send Reply</button>
      `}
      <small>Status: ${f.status}</small>
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.reply-feedback').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const reply = document.getElementById(`reply-${id}`).value;
      if (!reply.trim()) return alert('Please enter a reply');
      const res = await fetchAuth(`/admin/feedback/${id}/reply`, { method: 'PUT', body: JSON.stringify({ reply }) });
      if (res.ok) {
        showToast('Reply sent');
        loadFeedback();
      } else showToast('Failed', true);
    });
  });
}

// ========== GROUPS ==========
async function createGroup() {
  const name = document.getElementById('groupName').value.trim();
  const genderType = document.getElementById('groupGenderType').value;
  if (!name) {
    document.getElementById('groupCreateMsg').innerHTML = '<span style="color:#ff004c">Group name required</span>';
    return;
  }
  const res = await fetchAuth('/admin/groups', {
    method: 'POST',
    body: JSON.stringify({ name, genderType })
  });
  if (res.ok) {
    document.getElementById('groupCreateMsg').innerHTML = '<span style="color:#00f0ff">Group created successfully!</span>';
    document.getElementById('groupName').value = '';
    loadGroups();
    setTimeout(() => document.getElementById('groupCreateMsg').innerHTML = '', 3000);
  } else {
    document.getElementById('groupCreateMsg').innerHTML = '<span style="color:#ff004c">Failed to create group</span>';
  }
}

async function loadGroups() {
  const res = await fetchAuth('/admin/groups');
  if (!res.ok) throw new Error('Load groups failed');
  const groups = await res.json();
  const container = document.getElementById('groupsList');
  if (!container) return;
  container.innerHTML = '';
  const usersRes = await fetchAuth('/admin/users');
  const allUsers = await usersRes.json();
  for (const group of groups) {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <strong>${escapeHtml(group.name)}</strong> (${group.genderType})<br>
      <strong>Members (${group.members.length}):</strong> 
      <span id="members-list-${group.id}">${group.members.map(m => allUsers.find(u => u.id === m)?.username || m).join(', ') || 'None'}</span><br>
      <select id="member-select-${group.id}" style="width:auto; margin-top:8px;">
        <option value="">-- Add member --</option>
        ${allUsers.filter(u => !group.members.includes(u.id) && u.role !== 'admin').map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`).join('')}
      </select>
      <button class="btn-small add-member-btn" data-group="${group.id}">Add Member</button>
      <hr>
      <small>Created: ${new Date(group.createdAt).toLocaleDateString()}</small>
    `;
    container.appendChild(div);
  }
  document.querySelectorAll('.add-member-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const groupId = btn.dataset.group;
      const select = document.getElementById(`member-select-${groupId}`);
      const memberId = select.value;
      if (!memberId) return;
      const res = await fetchAuth(`/admin/groups/${groupId}/add-members`, {
        method: 'POST',
        body: JSON.stringify({ memberIds: [memberId] })
      });
      if (res.ok) {
        showToast('Member added');
        loadGroups();
      } else showToast('Failed', true);
    });
  });
}

// ========== ANNOUNCEMENTS ==========
async function loadAnnouncements() {
  const res = await fetchAuth('/announcements');
  if (!res.ok) throw new Error('Load announcements failed');
  const announcements = await res.json();
  const container = document.getElementById('announcementsList');
  if (!container) return;
  container.innerHTML = '';
  announcements.forEach(a => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <h3>${escapeHtml(a.title)}</h3>
      <p>${escapeHtml(a.content)}</p>
      <small>Priority: ${a.priority} | ${new Date(a.createdAt).toLocaleString()}</small>
      <button class="btn-small delete-announcement" data-id="${a.id}">Delete</button>
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.delete-announcement').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Delete this announcement?')) {
        await fetchAuth(`/admin/announcements/${btn.dataset.id}`, { method: 'DELETE' });
        loadAnnouncements();
      }
    });
  });
}

async function createAnnouncement() {
  const title = document.getElementById('announcementTitle').value.trim();
  const content = document.getElementById('announcementContent').value.trim();
  const priority = document.getElementById('announcementPriority').value;
  if (!title || !content) {
    alert('Title and content required');
    return;
  }
  const res = await fetchAuth('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({ title, content, priority })
  });
  if (res.ok) {
    showToast('Announcement posted');
    document.getElementById('announcementTitle').value = '';
    document.getElementById('announcementContent').value = '';
    loadAnnouncements();
  } else showToast('Failed', true);
}

document.getElementById('createChallengeBtn')?.addEventListener('click', async () => {
  const title = document.getElementById('newChallengeTitle').value;
  const brokenCode = document.getElementById('newChallengeCode').value;
  const solution = document.getElementById('newChallengeSolution').value;
  const difficulty = document.getElementById('newChallengeDifficulty').value;
  const xpReward = parseInt(document.getElementById('newChallengeXP').value);
  if (!title || !brokenCode || !solution) return;
  await fetchAuth('/admin/challenges', {
    method: 'POST',
    body: JSON.stringify({ title, brokenCode, solution, difficulty, xpReward })
  });
  alert('Challenge created!');
  // clear form
});

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
      logout();
    }
  }, 1000);
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }
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

// Load conversations for admin
async function loadAdminConversations() {
  const res = await fetchAuth('/conversations');
  if (!res.ok) return;
  const conversations = await res.json();
  const container = document.getElementById('adminConversationsList');
  if (!container) return;
  container.innerHTML = '<div class="glass-card"><h3>Conversations</h3></div>';
  if (conversations.length === 0) {
    container.innerHTML += '<p>No messages yet.</p>';
    return;
  }
  conversations.forEach(conv => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.style.cursor = 'pointer';
    div.innerHTML = `<strong>${conv.otherName}</strong><br><small>${conv.lastMsg}</small><br><small>${new Date(conv.lastTime).toLocaleString()}</small>`;
    div.addEventListener('click', () => openAdminChat(conv.otherId, conv.otherName));
    container.appendChild(div);
  });
}

let currentChatUserId = null;
let currentChatUserName = null;

async function openAdminChat(userId, userName) {
  currentChatUserId = userId;
  currentChatUserName = userName;
  document.getElementById('chatWithName').innerText = `Chat with ${userName}`;
  document.getElementById('adminChatArea').style.display = 'block';
  // Load messages
  const res = await fetchAuth(`/messages/${userId}`);
  const messages = await res.json();
  const container = document.getElementById('adminChatMessages');
  container.innerHTML = messages.map(m => `
    <div style="text-align:${m.from === currentChatUserId ? 'left' : 'right'}; margin-bottom:8px;">
      <div style="display:inline-block; padding:8px; border-radius:12px; background:${m.from === currentChatUserId ? '#1a1f2e' : '#ff004c'}">
        <strong>${m.from === currentChatUserId ? userName : 'You'}:</strong> ${escapeHtml(m.text)}
      </div>
      <div style="font-size:0.7rem; color:#888;">${new Date(m.createdAt).toLocaleString()}</div>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

document.getElementById('sendReplyBtn')?.addEventListener('click', async () => {
  const text = document.getElementById('adminReplyMsg').value.trim();
  if (!text || !currentChatUserId) return;
  const res = await fetchAuth('/messages', { method: 'POST', body: JSON.stringify({ to: currentChatUserId, text }) });
  if (res.ok) {
    document.getElementById('adminReplyMsg').value = '';
    openAdminChat(currentChatUserId, currentChatUserName);
  } else {
    alert('Failed to send reply');
  }
});

// Call loadAdminConversations when the Messages section becomes active
// Add this inside your section switch logic (you can attach to the sidebar click)
// For simplicity, add a listener on the Messages sidebar item to load conversations.
document.querySelector('[data-section="messages"]')?.addEventListener('click', () => {
  loadAdminConversations();
});