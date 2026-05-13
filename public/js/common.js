const API_BASE = '/api';

function getToken() { return localStorage.getItem('token'); }
function setToken(token) { localStorage.setItem('token', token); }

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/login';
}

async function fetchAuth(url, options = {}) {
  const token = getToken();
  if (!token && window.location.pathname !== '/login' && window.location.pathname !== '/') {
    window.location.href = '/login';
    return;
  }
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + url, { ...options, headers });
  if (res.status === 401) { logout(); return; }
  return res;
}

function formatDate(iso) { return new Date(iso).toLocaleString(); }

function showToast(msg, isError = false) {
  const toast = document.createElement('div');
  toast.innerText = msg;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.backgroundColor = isError ? '#ff004c' : '#00f0ff';
  toast.style.color = '#0b0f1a';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.zIndex = '9999';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== NOTIFICATION FUNCTIONS (fixed) ==========
async function markAllNotificationsRead() {
  const token = getToken();
  if (!token) return;
  const res = await fetch('/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.ok) {
    const notifs = await res.json();
    const unreadIds = notifs.filter(n => !n.read).map(n => n.id);
    for (const id of unreadIds) {
      await fetch(`/api/notifications/${id}/read`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
    }
    loadNotifications(); // refresh list
  }
}

async function loadNotifications() {
  const token = getToken();
  if (!token) return;
  const res = await fetch('/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.ok) {
    const notifs = await res.json();
    const unread = notifs.filter(n => !n.read);
    const badge = document.getElementById('notifBadge');
    if (badge) badge.innerText = unread.length > 0 ? unread.length : '';
    const container = document.getElementById('notifList');
    if (container) {
      if (unread.length === 0) {
        container.innerHTML = '<div style="padding:10px;">No new notifications</div>';
      } else {
        container.innerHTML = unread.map(n => `
          <div class="notif-item unread" data-id="${n.id}">
            <div>${n.message}</div>
            <div class="notif-time">${new Date(n.createdAt).toLocaleString()}</div>
          </div>
        `).join('');
      }
      // Attach click handlers to mark as read and remove from UI
      document.querySelectorAll('.notif-item').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.dataset.id;
          await fetch(`/api/notifications/${id}/read`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
          loadNotifications(); // refresh list
        });
      });
    }
  }
}

// Start polling every 15 seconds for new notifications (updates badge only)
function startNotificationPolling() {
  if (window.notifInterval) clearInterval(window.notifInterval);
  window.notifInterval = setInterval(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const notifs = await res.json();
      const unread = notifs.filter(n => !n.read).length;
      const badge = document.getElementById('notifBadge');
      if (badge) badge.innerText = unread > 0 ? unread : '';
      // Optionally refresh dropdown if open
      const dropdown = document.getElementById('notifDropdown');
      if (dropdown && dropdown.classList.contains('show')) loadNotifications();
    }
  }, 15000);
}

// ========== THEME TOGGLE ==========
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') document.body.classList.add('light');
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
    });
  }
}

// ========== EXPORT DATA ==========
async function exportUserData() {
  const res = await fetchAuth('/user/export-data');
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-404dev-data.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ========== REPORT CONTENT ==========
async function reportContent(targetType, targetId, reason) {
  const res = await fetchAuth('/reports', {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, reason })
  });
  if (res.ok) showToast('Report submitted. Admin will review.');
  else showToast('Failed to submit report', true);
}