// ========== GLOBAL ==========
let currentUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadFeed();
  await loadMemes();
  await loadChallenges();
  await loadLeaderboard();
  await loadSavedPosts();
  await loadUserGroups();        // Groups user belongs to
  await loadAnnouncements();     // Announcements
  await loadFeedbackForm();      // Not needed, just event listener

  // Event listeners
  document.getElementById('updateProfileBtn')?.addEventListener('click', updateProfile);
  document.getElementById('uploadProfilePic')?.addEventListener('change', uploadProfilePic);
  document.getElementById('changePwdBtn')?.addEventListener('click', changePassword);
  document.getElementById('deleteAccountBtn')?.addEventListener('click', deleteAccount);
  document.getElementById('uploadMemeForm')?.addEventListener('submit', uploadMeme);
  document.getElementById('createPostForm')?.addEventListener('submit', createPost);
  document.getElementById('submitFeedbackBtn')?.addEventListener('click', submitFeedback);
});

// ========== PROFILE ==========
async function loadProfile() {
  const res = await fetchAuth('/user/profile');
  const user = await res.json();
  currentUserId = user.id;
  document.getElementById('username').innerText = user.username;
  if (user.verifiedTick) document.getElementById('verifiedBadge').style.display = 'inline';
  if (user.profilePic) document.getElementById('profileImg').src = user.profilePic;
  document.getElementById('userLevel').innerText = user.level;
  document.getElementById('userXp').innerText = user.xp;
  document.getElementById('userBio').innerText = user.bio || 'No bio';
  document.getElementById('userSkills').innerText = user.skills.join(', ') || 'None';
  document.getElementById('editUsername').value = user.username;
  document.getElementById('editBio').value = user.bio || '';
  document.getElementById('editSkills').value = user.skills.join(', ');

  const analyticsRes = await fetchAuth('/user/analytics');
  const stats = await analyticsRes.json();
  document.getElementById('statPosts').innerText = stats.postsCreated;
  document.getElementById('statBugs').innerText = stats.bugsFixed;
  document.getElementById('statLikes').innerText = stats.likesReceived;
}

async function updateProfile() {
  const username = document.getElementById('editUsername').value;
  const bio = document.getElementById('editBio').value;
  const skills = document.getElementById('editSkills').value;
  const res = await fetchAuth('/user/profile', {
    method: 'PUT',
    body: JSON.stringify({ username, bio, skills })
  });
  if (res.ok) {
    showToast('Profile updated');
    loadProfile();
  } else showToast('Update failed', true);
}

async function uploadProfilePic(e) {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('profilePic', file);
  const token = getToken();
  const res = await fetch('/api/user/upload-profile', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (res.ok) {
    showToast('Profile picture updated! You are now verified ✅');
    loadProfile();
  } else showToast('Upload failed', true);
}

async function changePassword() {
  const current = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  const msgDiv = document.getElementById('pwdMessage');
  if (!current || !newPwd) {
    msgDiv.innerText = 'Please fill all fields';
    msgDiv.className = 'message error';
    msgDiv.style.display = 'block';
    return;
  }
  if (newPwd !== confirm) {
    msgDiv.innerText = 'New passwords do not match';
    msgDiv.className = 'message error';
    msgDiv.style.display = 'block';
    return;
  }
  if (newPwd.length < 4) {
    msgDiv.innerText = 'Password must be at least 4 characters';
    msgDiv.className = 'message error';
    msgDiv.style.display = 'block';
    return;
  }
  const res = await fetchAuth('/user/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: current, newPassword: newPwd })
  });
  const data = await res.json();
  if (res.ok) {
    msgDiv.innerText = data.message;
    msgDiv.className = 'message success';
    msgDiv.style.display = 'block';
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    setTimeout(() => msgDiv.style.display = 'none', 3000);
  } else {
    msgDiv.innerText = data.error;
    msgDiv.className = 'message error';
    msgDiv.style.display = 'block';
  }
}

async function deleteAccount() {
  if (confirm('⚠️ Delete account permanently? All your posts and memes will be gone.')) {
    const res = await fetchAuth('/user/delete-account', { method: 'DELETE' });
    if (res.ok) logout();
  }
}

// ========== MEMES ==========
async function uploadMeme(e) {
  e.preventDefault();
  const title = document.getElementById('memeTitle').value;
  const file = document.getElementById('memeFile').files[0];
  if (!title || !file) return;
  const formData = new FormData();
  formData.append('title', title);
  formData.append('meme', file);
  const token = getToken();
  const res = await fetch('/api/memes/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (res.ok) {
    showToast('Meme uploaded!');
    document.getElementById('uploadMemeForm').reset();
    loadMemes();
  } else showToast('Upload failed', true);
}

async function loadMemes() {
  const res = await fetchAuth('/memes');
  const memes = await res.json();
  const container = document.getElementById('memesFeed');
  if (!container) return;
  container.innerHTML = '';
  memes.forEach(meme => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <img src="${meme.url}" width="100%">
      <p><strong>${meme.title}</strong> by ${meme.authorName} ${meme.authorVerified ? '✅' : ''}</p>
      <button class="btn meme-like" data-id="${meme.id}">❤️ ${meme.likes.length}</button>
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.meme-like').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await fetchAuth(`/memes/${id}/like`, { method: 'POST' });
      loadMemes();
    });
  });
}

// ========== FEED ==========
async function loadFeed() {
  const res = await fetchAuth('/posts');
  const posts = await res.json();
  const container = document.getElementById('postsFeed');
  if (!container) return;
  container.innerHTML = '';
  for (const post of posts) {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <h3>${escapeHtml(post.title)}</h3>
      <small>by ${post.authorName} ${post.authorVerified ? '✅' : ''} | ${new Date(post.createdAt).toLocaleString()}</small>
      <p>${escapeHtml(post.content.substring(0, 200))}...</p>
      <button class="btn like-btn" data-id="${post.id}">❤️ ${post.likes.length}</button>
      <button class="btn-small save-btn" data-id="${post.id}">🔖 Save</button>
      <button class="btn-small report-btn" data-id="${post.id}">🚨 Report</button>
    `;
    container.appendChild(div);
  }
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await fetchAuth(`/posts/${id}/like`, { method: 'POST' });
      loadFeed();
    });
  });
  document.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await fetchAuth(`/posts/${id}/save`, { method: 'POST' });
      showToast('Saved!');
    });
  });
  document.querySelectorAll('.report-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const reason = prompt('Why report this post?');
      if (reason) reportContent('post', btn.dataset.id, reason);
    });
  });
}

// ========== DEBUG ARENA ==========
async function loadChallenges() {
  const res = await fetchAuth('/challenges');
  const challenges = await res.json();
  const container = document.getElementById('challengesList');
  if (!container) return;
  container.innerHTML = '';
  challenges.forEach(ch => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <h3>${ch.title}</h3>
      <pre><code>${ch.brokenCode}</code></pre>
      <textarea id="sol-${ch.id}" placeholder="Your fix..."></textarea>
      <button class="btn submit-challenge" data-id="${ch.id}" data-reward="${ch.xpReward}">Submit</button>
      <span id="result-${ch.id}"></span>
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.submit-challenge').forEach(btn => {
    btn.addEventListener('click', async () => {
      const challengeId = btn.dataset.id;
      const solution = document.getElementById(`sol-${challengeId}`).value;
      const res = await fetchAuth('/challenges/submit', {
        method: 'POST',
        body: JSON.stringify({ challengeId, userSolution: solution })
      });
      const data = await res.json();
      if (data.correct) {
        showToast(`✅ Correct! +${data.xpGained} XP`);
        loadProfile();
        loadLeaderboard();
      } else showToast('❌ Wrong solution. Try again!', true);
    });
  });
}

async function loadLeaderboard() {
  const res = await fetchAuth('/leaderboard');
  const data = await res.json();
  const lbDiv = document.getElementById('leaderboard');
  if (lbDiv) {
    lbDiv.innerHTML = '<ul>';
    data.forEach((u, i) => {
      lbDiv.innerHTML += `<li>${i+1}. ${u.username} ${u.verifiedTick ? '✅' : ''} - ${u.xp} XP (${u.level})</li>`;
    });
    lbDiv.innerHTML += '</ul>';
  }
}

// ========== SAVED POSTS ==========
async function loadSavedPosts() {
  const res = await fetchAuth('/user/saved-posts');
  const posts = await res.json();
  const container = document.getElementById('savedPostsList');
  if (container) {
    container.innerHTML = '';
    posts.forEach(post => {
      const div = document.createElement('div');
      div.className = 'glass-card';
      div.innerHTML = `<h3>${post.title}</h3><p>${post.content.substring(0, 150)}...</p>`;
      container.appendChild(div);
    });
  }
}

async function createPost(e) {
  e.preventDefault();
  const title = document.getElementById('postTitle').value;
  const content = document.getElementById('postContent').value;
  const category = document.getElementById('postCategory').value;
  const tags = document.getElementById('postTags').value;
  const res = await fetchAuth('/posts', {
    method: 'POST',
    body: JSON.stringify({ title, content, category, tags })
  });
  if (res.ok) {
    showToast('Post created, pending admin approval');
    e.target.reset();
  } else showToast('Failed', true);
}

// ========== FEEDBACK ==========
async function submitFeedback() {
  const message = document.getElementById('feedbackMsg')?.value;
  const rating = document.getElementById('feedbackRating')?.value;
  if (!message || !message.trim()) return alert('Please enter feedback');
  const res = await fetchAuth('/feedback', {
    method: 'POST',
    body: JSON.stringify({ message, rating: parseInt(rating) })
  });
  if (res.ok) {
    alert('Thank you for your feedback!');
    document.getElementById('feedbackMsg').value = '';
  } else alert('Failed to submit');
}

// ========== GROUPS (USER) ==========
async function loadUserGroups() {
  const res = await fetchAuth('/groups');
  const groups = await res.json();
  const container = document.getElementById('userGroupsList');
  if (!container) return;
  container.innerHTML = '';
  if (groups.length === 0) {
    container.innerHTML = '<p>You are not in any groups yet.</p>';
    return;
  }
  groups.forEach(group => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <h3>👥 ${escapeHtml(group.name)}</h3>
      <p>Type: ${group.genderType || 'mixed'}</p>
      <p>Members: ${group.members.length}</p>
      <button class="btn-small view-group-chat" data-id="${group.id}" data-name="${escapeHtml(group.name)}">Open Chat</button>
    `;
    container.appendChild(div);
  });
  // Add event listeners to open group chat (you can redirect to messages page or open modal)
  document.querySelectorAll('.view-group-chat').forEach(btn => {
    btn.addEventListener('click', () => {
      const groupId = btn.dataset.id;
      const groupName = btn.dataset.name;
      // Redirect to messages page with group parameter
      window.location.href = `/messages.html?group=${groupId}&name=${encodeURIComponent(groupName)}`;
    });
  });
}

// ========== ANNOUNCEMENTS ==========
async function loadAnnouncements() {
  const res = await fetchAuth('/announcements');
  const announcements = await res.json();
  const container = document.getElementById('announcementsList');
  if (!container) return;
  container.innerHTML = '';
  if (announcements.length === 0) {
    container.innerHTML = '<p>No announcements yet.</p>';
    return;
  }
  announcements.forEach(ann => {
    const div = document.createElement('div');
    div.className = 'glass-card';
    div.innerHTML = `
      <h3>📢 ${escapeHtml(ann.title)} ${ann.pinned ? '📌' : ''}</h3>
      <p>${escapeHtml(ann.content)}</p>
      <small>Posted: ${new Date(ann.createdAt).toLocaleString()}</small>
    `;
    container.appendChild(div);
  });
}

// ========== UTILITIES ==========
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }