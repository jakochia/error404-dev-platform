const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const auth = require('./middleware/auth');
const cron = require('node-cron');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { OpenAI } = require('openai');
const fetch = require('node-fetch');

const app = express();
const PORT = 4040;
const SECRET = '404_DEV_SECRET_GLITCH';

// OpenAI (optional)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Multer config
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/profiles/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const memeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/memes/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const uploadProfile = multer({ storage: profileStorage });
const uploadMeme = multer({ storage: memeStorage });

// Helper: read/write JSON
const readDB = (file) => fs.readJsonSync(path.join(__dirname, 'data', `${file}.json`), { throws: false }) || [];
const writeDB = (file, data) => fs.writeJsonSync(path.join(__dirname, 'data', `${file}.json`), data, { spaces: 2 });

// Initialize JSON databases
const initDB = () => {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data');
  if (!fs.existsSync('./public/uploads/profiles')) fs.mkdirSync('./public/uploads/profiles', { recursive: true });
  if (!fs.existsSync('./public/uploads/memes')) fs.mkdirSync('./public/uploads/memes', { recursive: true });

  // users
  let users = readDB('users');
  if (users.length === 0) {
    const adminPass = bcrypt.hashSync('ASHER01!?', 10);
    users.push({
      id: uuidv4(),
      username: 'error.404.ke',
      email: 'admin@error404.dev',
      password: adminPass,
      role: 'admin',
      banned: false,
      profilePic: null,
      verifiedTick: false,
      bio: 'System Administrator',
      skills: ['JavaScript', 'Node.js', 'Cyber'],
      xp: 5000,
      level: '404 Master',
      postsCreated: 0,
      bugsFixed: 0,
      likesReceived: 0,
      memesUploaded: 0,
      emailVerified: true,
      twoFAEnabled: false,
      createdAt: new Date().toISOString()
    });
    writeDB('users', users);
  }

  // other DBs
  const dbs = ['posts', 'memes', 'challenges', 'threads', 'comments', 'reports', 'logs', 'config', 'notifications', 'messages', 'follows', 'leaderboard_archive', 'groups'];
  dbs.forEach(db => { if (readDB(db).length === 0) writeDB(db, []); });

  if (readDB('config').length === 0) writeDB('config', [{ blogEnabled: true, memesEnabled: true, challengesEnabled: true }]);
  if (readDB('challenges').length === 0) {
    writeDB('challenges', [
      { id: 'ch1', title: 'Fix the sum function', brokenCode: 'function sum(a,b){ return a - b; }', solution: 'return a + b', difficulty: 'easy', xpReward: 50 },
      { id: 'ch2', title: 'Array double', brokenCode: 'const double = arr => arr.map(x => x * 3);', solution: 'arr.map(x => x * 2)', difficulty: 'easy', xpReward: 75 },
      { id: 'ch3', title: 'Palindrome check', brokenCode: 'function isPal(str){ return str === str.split("").reverse().join(""); }', solution: 'return str === str.split("").reverse().join("")', difficulty: 'medium', xpReward: 120 }
    ]);
  }
};
initDB();

// Logging helper
function addLog(action, userId, details) {
  const logs = readDB('logs');
  logs.push({ id: uuidv4(), action, userId, details, timestamp: new Date().toISOString() });
  writeDB('logs', logs);
}

// ========== ONLINE USERS (in-memory) ==========
const onlineUsers = new Set();

app.post('/api/online', auth, (req, res) => {
  onlineUsers.add(req.userId);
  res.json({ online: Array.from(onlineUsers) });
});

app.post('/api/offline', auth, (req, res) => {
  onlineUsers.delete(req.userId);
  res.json({ success: true });
});

app.get('/api/online-users', auth, (req, res) => {
  const users = readDB('users');
  const onlineList = Array.from(onlineUsers).map(id => {
    const u = users.find(u => u.id === id);
    return { id, username: u?.username };
  });
  res.json(onlineList);
});

// ========== AUTHENTICATION ==========
app.post('/api/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;
  let users = readDB('users');
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already exists' });
  const hashed = bcrypt.hashSync(password, 10);
  const newUser = {
    id: uuidv4(),
    username,
    email,
    password: hashed,
    role: 'user',
    banned: false,
    profilePic: null,
    verifiedTick: false,
    bio: 'New developer',
    skills: [],
    xp: 0,
    level: 'Beginner Debugger',
    postsCreated: 0,
    bugsFixed: 0,
    likesReceived: 0,
    memesUploaded: 0,
    emailVerified: true,
    twoFAEnabled: false,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  writeDB('users', users);
  addLog('signup', newUser.id, `User ${username} signed up`);
  const token = jwt.sign({ id: newUser.id, role: newUser.role }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: newUser.id, role: newUser.role, username, verifiedTick: false } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, remember, twoFAToken } = req.body;
  const users = readDB('users');
  const user = users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.banned) return res.status(403).json({ error: 'Account banned' });

  if (user.twoFAEnabled) {
    if (!twoFAToken) return res.status(401).json({ error: '2FA required', twoFARequired: true });
    const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token: twoFAToken });
    if (!verified) return res.status(401).json({ error: 'Invalid 2FA code' });
  }

  const expiresIn = remember ? '30d' : '1d';
  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn });
  res.json({ token, user: { id: user.id, role: user.role, username: user.username, verifiedTick: user.verifiedTick } });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  const users = readDB('users');
  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'Email not found' });
  const resetToken = uuidv4();
  if (!global.resetTokens) global.resetTokens = {};
  global.resetTokens[resetToken] = user.id;
  console.log(`\n🔐 PASSWORD RESET FOR ${email}\n   Token: ${resetToken}\n   POST /api/auth/reset-password with { token, newPassword }`);
  res.json({ message: 'Reset token sent (check console)' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!global.resetTokens || !global.resetTokens[token]) return res.status(400).json({ error: 'Invalid or expired token' });
  const userId = global.resetTokens[token];
  let users = readDB('users');
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404);
  user.password = bcrypt.hashSync(newPassword, 10);
  writeDB('users', users);
  delete global.resetTokens[token];
  res.json({ message: 'Password updated' });
});

// ========== USER PROFILE ==========
app.post('/api/user/upload-profile', auth, uploadProfile.single('profilePic'), (req, res) => {
  let users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  if (user) {
    if (user.profilePic) {
      const oldPath = path.join(__dirname, 'public', user.profilePic);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    user.profilePic = `/uploads/profiles/${req.file.filename}`;
    user.verifiedTick = true;
    writeDB('users', users);
    addLog('upload_profile', req.userId, 'Profile picture uploaded');
    res.json({ profilePic: user.profilePic, verifiedTick: true });
  } else res.status(404);
});

app.delete('/api/user/delete-account', auth, (req, res) => {
  let users = readDB('users');
  const userId = req.userId;
  users = users.filter(u => u.id !== userId);
  writeDB('users', users);
  let posts = readDB('posts');
  posts = posts.filter(p => p.authorId !== userId);
  writeDB('posts', posts);
  let memes = readDB('memes');
  memes = memes.filter(m => m.authorId !== userId);
  writeDB('memes', memes);
  let threads = readDB('threads');
  threads = threads.filter(t => t.authorId !== userId);
  writeDB('threads', threads);
  addLog('delete_account', userId, 'Account deleted');
  res.json({ message: 'Account deleted' });
});

app.get('/api/user/profile', auth, (req, res) => {
  const users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  if (user) {
    const { password, twoFASecret, ...safe } = user;
    res.json(safe);
  } else res.status(404);
});

app.put('/api/user/profile', auth, (req, res) => {
  const users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  if (user) {
    const { username, bio, skills } = req.body;
    if (username) user.username = username;
    if (bio) user.bio = bio;
    if (skills) user.skills = skills.split(',').map(s => s.trim());
    writeDB('users', users);
    res.json({ success: true });
  } else res.status(404);
});

app.post('/api/user/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  let users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const isMatch = bcrypt.compareSync(currentPassword, user.password);
  if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect' });
  user.password = bcrypt.hashSync(newPassword, 10);
  writeDB('users', users);
  addLog('change_password', req.userId, 'Password changed');
  res.json({ message: 'Password updated successfully' });
});

// 2FA
app.post('/api/user/2fa/setup', auth, (req, res) => {
  const secret = speakeasy.generateSecret({ length: 20, name: `404Dev:${req.userId}` });
  let users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  user.twoFASecret = secret.base32;
  writeDB('users', users);
  QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
    if (err) return res.status(500).json({ error: 'QR generation failed' });
    res.json({ secret: secret.base32, qr: data_url });
  });
});

app.post('/api/user/2fa/verify', auth, (req, res) => {
  const { token } = req.body;
  const users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token });
  if (verified) {
    user.twoFAEnabled = true;
    writeDB('users', users);
    res.json({ success: true });
  } else res.status(400).json({ error: 'Invalid token' });
});

app.get('/api/user/export-data', auth, (req, res) => {
  const users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  const posts = readDB('posts').filter(p => p.authorId === req.userId);
  const memes = readDB('memes').filter(m => m.authorId === req.userId);
  const threads = readDB('threads').filter(t => t.authorId === req.userId);
  const messages = readDB('messages').filter(m => m.from === req.userId || m.to === req.userId);
  const exportData = {
    profile: { ...user, password: undefined, twoFASecret: undefined },
    posts, memes, threads, messages
  };
  res.setHeader('Content-Disposition', 'attachment; filename="my-404dev-data.json"');
  res.json(exportData);
});

// ========== BLOG SYSTEM ==========
app.get('/api/posts', (req, res) => {
  let posts = readDB('posts');
  const users = readDB('users');
  const config = readDB('config')[0];
  if (!config.blogEnabled) return res.json([]);
  posts = posts.filter(p => p.approved).map(p => {
    const author = users.find(u => u.id === p.authorId);
    return { ...p, authorName: author?.username, authorVerified: author?.verifiedTick || false };
  });
  res.json(posts);
});

app.get('/api/posts/all', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  let posts = readDB('posts');
  const users = readDB('users');
  posts = posts.map(p => ({ ...p, authorName: users.find(u => u.id === p.authorId)?.username }));
  res.json(posts);
});

app.post('/api/posts', auth, (req, res) => {
  const { title, content, category, tags } = req.body;
  const newPost = {
    id: uuidv4(),
    title,
    content,
    category: category || 'Tutorials',
    tags: tags ? tags.split(',') : [],
    authorId: req.userId,
    approved: false,
    likes: [],
    savedBy: [],
    createdAt: new Date().toISOString()
  };
  const posts = readDB('posts');
  posts.push(newPost);
  writeDB('posts', posts);
  let users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  if (user) user.postsCreated += 1;
  writeDB('users', users);
  addLog('create_post', req.userId, `Post: ${title}`);
  res.json(newPost);
});

app.delete('/api/posts/:id', auth, (req, res) => {
  let posts = readDB('posts');
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404);
  const post = posts[idx];
  const users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  if (user.role === 'admin' || post.authorId === req.userId) {
    posts.splice(idx, 1);
    writeDB('posts', posts);
    res.json({ success: true });
  } else res.status(403);
});

app.post('/api/posts/:id/like', auth, (req, res) => {
  let posts = readDB('posts');
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404);
  if (post.likes.includes(req.userId)) post.likes = post.likes.filter(id => id !== req.userId);
  else post.likes.push(req.userId);
  writeDB('posts', posts);
  res.json({ likes: post.likes.length });
});

app.post('/api/posts/:id/save', auth, (req, res) => {
  let posts = readDB('posts');
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404);
  if (!post.savedBy) post.savedBy = [];
  if (post.savedBy.includes(req.userId)) post.savedBy = post.savedBy.filter(id => id !== req.userId);
  else post.savedBy.push(req.userId);
  writeDB('posts', posts);
  res.json({ saved: post.savedBy.includes(req.userId) });
});

app.get('/api/user/saved-posts', auth, (req, res) => {
  const posts = readDB('posts').filter(p => p.savedBy?.includes(req.userId));
  res.json(posts);
});

app.put('/api/admin/posts/:id/approve', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  let posts = readDB('posts');
  const post = posts.find(p => p.id === req.params.id);
  if (post) { post.approved = true; writeDB('posts', posts); }
  res.json({ approved: true });
});

// ========== MEME ZONE ==========
app.post('/api/memes/upload', auth, uploadMeme.single('meme'), (req, res) => {
  const memes = readDB('memes');
  const newMeme = {
    id: uuidv4(),
    url: `/uploads/memes/${req.file.filename}`,
    title: req.body.title,
    authorId: req.userId,
    likes: [],
    createdAt: new Date().toISOString()
  };
  memes.push(newMeme);
  writeDB('memes', memes);
  let users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  if (user) user.memesUploaded = (user.memesUploaded || 0) + 1;
  writeDB('users', users);
  res.json(newMeme);
});

app.get('/api/memes', (req, res) => {
  const config = readDB('config')[0];
  if (!config.memesEnabled) return res.json([]);
  const memes = readDB('memes');
  const users = readDB('users');
  const enriched = memes.map(m => ({ ...m, authorName: users.find(u => u.id === m.authorId)?.username, authorVerified: users.find(u => u.id === m.authorId)?.verifiedTick || false }));
  res.json(enriched);
});

app.post('/api/memes/:id/like', auth, (req, res) => {
  let memes = readDB('memes');
  const meme = memes.find(m => m.id === req.params.id);
  if (meme) {
    if (meme.likes.includes(req.userId)) meme.likes = meme.likes.filter(id => id !== req.userId);
    else meme.likes.push(req.userId);
    writeDB('memes', memes);
    res.json({ likes: meme.likes.length });
  } else res.status(404);
});

// ========== DEBUG ARENA ==========
app.get('/api/challenges', (req, res) => {
  const config = readDB('config')[0];
  if (!config.challengesEnabled) return res.json([]);
  res.json(readDB('challenges'));
});

app.post('/api/challenges/submit', auth, (req, res) => {
  const { challengeId, userSolution } = req.body;
  const challenges = readDB('challenges');
  const challenge = challenges.find(c => c.id === challengeId);
  if (!challenge) return res.status(404);
  let users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  const correct = userSolution.trim() === challenge.solution;
  if (correct) {
    user.xp += challenge.xpReward;
    user.bugsFixed += 1;
    if (user.xp >= 1000) user.level = '404 Master';
    else if (user.xp >= 500) user.level = 'Error Slayer';
    else if (user.xp >= 200) user.level = 'Bug Hunter';
    else user.level = 'Beginner Debugger';
    writeDB('users', users);
    addLog('challenge_solved', req.userId, `Solved ${challenge.title}`);
    res.json({ correct: true, xpGained: challenge.xpReward, newLevel: user.level });
  } else res.json({ correct: false });
});

app.get('/api/leaderboard', (req, res) => {
  const users = readDB('users');
  const top = users.sort((a,b) => b.xp - a.xp).slice(0,10).map(u => ({ username: u.username, xp: u.xp, level: u.level, verifiedTick: u.verifiedTick }));
  res.json(top);
});

// ========== COMMUNITY FORUM ==========
app.get('/api/threads', (req, res) => {
  const threads = readDB('threads');
  const users = readDB('users');
  const enriched = threads.map(t => ({ ...t, authorName: users.find(u => u.id === t.authorId)?.username, authorVerified: users.find(u => u.id === t.authorId)?.verifiedTick || false }));
  res.json(enriched);
});

app.post('/api/threads', auth, (req, res) => {
  const { title, content, category } = req.body;
  const newThread = { id: uuidv4(), title, content, category: category || 'General', authorId: req.userId, comments: [], createdAt: new Date().toISOString() };
  const threads = readDB('threads');
  threads.push(newThread);
  writeDB('threads', threads);
  res.json(newThread);
});

app.post('/api/threads/:id/comment', auth, (req, res) => {
  const { text } = req.body;
  let threads = readDB('threads');
  const thread = threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404);
  const comment = { id: uuidv4(), text, authorId: req.userId, createdAt: new Date().toISOString() };
  thread.comments.push(comment);
  writeDB('threads', threads);
  res.json(comment);
});

// ========== BUG REPORTS ==========
app.post('/api/reports', auth, (req, res) => {
  const { targetType, targetId, reason } = req.body;
  const reports = readDB('reports');
  reports.push({ id: uuidv4(), reporterId: req.userId, targetType, targetId, reason, status: 'pending', createdAt: new Date().toISOString() });
  writeDB('reports', reports);
  res.json({ success: true });
});

app.get('/api/reports', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const reports = readDB('reports');
  const users = readDB('users');
  const enriched = reports.map(r => ({ ...r, reporterName: users.find(u => u.id === r.reporterId)?.username }));
  res.json(enriched);
});

// ========== NOTIFICATIONS ==========
app.post('/api/notifications', auth, (req, res) => {
  const { userId, message, type, relatedId } = req.body;
  let notifs = readDB('notifications');
  const newNotif = { id: uuidv4(), userId, message, type, read: false, relatedId, createdAt: new Date().toISOString() };
  notifs.push(newNotif);
  writeDB('notifications', notifs);
  res.json(newNotif);
});

app.get('/api/notifications', auth, (req, res) => {
  let notifs = readDB('notifications').filter(n => n.userId === req.userId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(notifs);
});

app.put('/api/notifications/:id/read', auth, (req, res) => {
  let notifs = readDB('notifications');
  const n = notifs.find(n => n.id === req.params.id && n.userId === req.userId);
  if (n) n.read = true;
  writeDB('notifications', notifs);
  res.json({ success: true });
});

// ========== PRIVATE MESSAGING & GROUPS ==========
app.get('/api/conversations', auth, (req, res) => {
  const messages = readDB('messages');
  const users = readDB('users');
  const userId = req.userId;
  const convMap = new Map();
  messages.forEach(m => {
    const other = m.from === userId ? m.to : m.from;
    if (!convMap.has(other)) convMap.set(other, []);
    convMap.get(other).push(m);
  });
  const result = Array.from(convMap.keys()).map(otherId => {
    const otherUser = users.find(u => u.id === otherId);
    const lastMsg = convMap.get(otherId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return { otherId, otherName: otherUser?.username, lastMsg: lastMsg.text, lastTime: lastMsg.createdAt };
  });
  res.json(result);
});

app.get('/api/messages/:userId', auth, (req, res) => {
  const messages = readDB('messages').filter(m =>
    (m.from === req.userId && m.to === req.params.userId) ||
    (m.from === req.params.userId && m.to === req.userId)
  ).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(messages);
});

app.post('/api/messages', auth, (req, res) => {
  const { to, text } = req.body;
  const messages = readDB('messages');
  const newMsg = { id: uuidv4(), from: req.userId, to, text, read: false, createdAt: new Date().toISOString() };
  messages.push(newMsg);
  writeDB('messages', messages);
  let notifs = readDB('notifications');
  notifs.push({ id: uuidv4(), userId: to, message: `New message from ${req.userId}`, type: 'message', read: false, relatedId: newMsg.id, createdAt: new Date().toISOString() });
  writeDB('notifications', notifs);
  res.json(newMsg);
});

// Groups
app.get('/api/groups', auth, (req, res) => {
  const groups = readDB('groups');
  res.json(groups);
});

app.post('/api/groups', auth, (req, res) => {
  const { name, members } = req.body;
  const groups = readDB('groups');
  const newGroup = {
    id: uuidv4(),
    name,
    creatorId: req.userId,
    members: [req.userId, ...(members || [])],
    messages: [],
    createdAt: new Date().toISOString()
  };
  groups.push(newGroup);
  writeDB('groups', groups);
  res.json(newGroup);
});

app.post('/api/groups/:groupId/message', auth, (req, res) => {
  const { text } = req.body;
  let groups = readDB('groups');
  const group = groups.find(g => g.id === req.params.groupId);
  if (!group) return res.status(404);
  const newMsg = { id: uuidv4(), from: req.userId, text, createdAt: new Date().toISOString() };
  group.messages.push(newMsg);
  writeDB('groups', groups);
  res.json(newMsg);
});

app.get('/api/groups/:groupId/messages', auth, (req, res) => {
  const groups = readDB('groups');
  const group = groups.find(g => g.id === req.params.groupId);
  if (!group) return res.status(404);
  res.json(group.messages || []);
});

// ========== FOLLOW SYSTEM ==========
app.post('/api/follow/:userId', auth, (req, res) => {
  let follows = readDB('follows');
  const existing = follows.find(f => f.followerId === req.userId && f.followingId === req.params.userId);
  if (existing) follows = follows.filter(f => f.id !== existing.id);
  else follows.push({ id: uuidv4(), followerId: req.userId, followingId: req.params.userId, createdAt: new Date().toISOString() });
  writeDB('follows', follows);
  res.json({ following: !existing });
});

app.get('/api/followers/:userId', auth, (req, res) => {
  const follows = readDB('follows');
  const followers = follows.filter(f => f.followingId === req.params.userId).map(f => f.followerId);
  const following = follows.filter(f => f.followerId === req.params.userId).map(f => f.followingId);
  const users = readDB('users');
  const followerNames = followers.map(id => users.find(u => u.id === id)?.username);
  const followingNames = following.map(id => users.find(u => u.id === id)?.username);
  res.json({ followers: followerNames, following: followingNames });
});

// ========== IMPROVED CODE EXECUTION ==========
app.post('/api/execute', auth, async (req, res) => {
  const { language, code, stdin } = req.body;
  const langMap = { javascript: 'js', python: 'py', html: 'html' };
  const targetLang = langMap[language] || language;
  try {
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: targetLang, version: '*', files: [{ content: code }], stdin: stdin || '' })
    });
    const data = await response.json();
    res.json({ output: data.run?.output || data.message, error: data.run?.stderr || '' });
  } catch (err) {
    res.status(500).json({ error: 'Execution failed' });
  }
});

// ========== AI DEBUGGING ==========
app.post('/api/ai-debug', auth, async (req, res) => {
  const { code, error } = req.body;
  if (!openai) return res.status(501).json({ error: 'OpenAI API not configured' });
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Fix this code:\n${code}\nError: ${error || 'none'}` }],
    });
    res.json({ suggestion: completion.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== WEEKLY LEADERBOARD RESET ==========
cron.schedule('0 0 * * 0', () => {
  const users = readDB('users');
  const archive = readDB('leaderboard_archive');
  const snapshot = users.map(u => ({ username: u.username, xp: u.xp, level: u.level, date: new Date().toISOString() }));
  archive.push(...snapshot);
  writeDB('leaderboard_archive', archive);
  console.log('Weekly leaderboard archived.');
});

app.get('/api/leaderboard/archive', (req, res) => {
  res.json(readDB('leaderboard_archive'));
});

// ========== ADMIN PANEL ==========
app.get('/api/admin/stats', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const users = readDB('users');
  const posts = readDB('posts');
  const memes = readDB('memes');
  const reports = readDB('reports');
  const activeUsers = users.filter(u => u.xp > 0).length;
  const pendingPosts = posts.filter(p => !p.approved).length;
  res.json({ totalUsers: users.length, activeUsers, totalPosts: posts.length, pendingPosts, totalMemes: memes.length, openReports: reports.filter(r => r.status === 'pending').length });
});

app.get('/api/admin/users', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const users = readDB('users').map(({ password, twoFASecret, ...rest }) => rest);
  res.json(users);
});

app.post('/api/admin/users', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { username, email, password, role } = req.body;
  let users = readDB('users');
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });
  const newUser = { id: uuidv4(), username, email, password: bcrypt.hashSync(password, 10), role: role || 'user', banned: false, profilePic: null, verifiedTick: false, bio: 'Added by admin', skills: [], xp: 0, level: 'Beginner Debugger', postsCreated: 0, bugsFixed: 0, likesReceived: 0, memesUploaded: 0, emailVerified: true, twoFAEnabled: false, createdAt: new Date().toISOString() };
  users.push(newUser);
  writeDB('users', users);
  res.json({ id: newUser.id, username, email, role });
});

app.put('/api/admin/users/:id/ban', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  let users = readDB('users');
  const user = users.find(u => u.id === req.params.id);
  if (user) { user.banned = !user.banned; writeDB('users', users); }
  res.json({ banned: user?.banned });
});

app.put('/api/admin/users/:id/role', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { role } = req.body;
  let users = readDB('users');
  const user = users.find(u => u.id === req.params.id);
  if (user) { user.role = role; writeDB('users', users); }
  res.json({ role });
});

app.delete('/api/admin/users/:id', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  let users = readDB('users');
  const userId = req.params.id;
  users = users.filter(u => u.id !== userId);
  writeDB('users', users);
  let posts = readDB('posts').filter(p => p.authorId !== userId);
  writeDB('posts', posts);
  let memes = readDB('memes').filter(m => m.authorId !== userId);
  writeDB('memes', memes);
  let threads = readDB('threads').filter(t => t.authorId !== userId);
  writeDB('threads', threads);
  res.json({ success: true });
});

app.get('/api/admin/logs', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  res.json(readDB('logs').slice(-100));
});

app.delete('/api/admin/memes/:id', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  let memes = readDB('memes').filter(m => m.id !== req.params.id);
  writeDB('memes', memes);
  res.json({ success: true });
});

app.get('/api/comments/all', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const threads = readDB('threads');
  let allComments = [];
  threads.forEach(thread => {
    thread.comments.forEach(c => {
      allComments.push({ ...c, postTitle: thread.title, postId: thread.id });
    });
  });
  const users = readDB('users');
  const enriched = allComments.map(c => ({ ...c, authorName: users.find(u => u.id === c.authorId)?.username }));
  res.json(enriched);
});

app.delete('/api/admin/comments/:id', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  let threads = readDB('threads');
  let found = false;
  threads = threads.map(thread => {
    const oldLen = thread.comments.length;
    thread.comments = thread.comments.filter(c => c.id !== req.params.id);
    if (thread.comments.length !== oldLen) found = true;
    return thread;
  });
  if (!found) return res.status(404);
  writeDB('threads', threads);
  res.json({ success: true });
});

app.put('/api/admin/reports/:id/resolve', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  let reports = readDB('reports');
  const report = reports.find(r => r.id === req.params.id);
  if (report) report.status = 'resolved';
  writeDB('reports', reports);
  res.json({ success: true });
});

app.get('/api/admin/config', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  res.json(readDB('config')[0]);
});

app.put('/api/admin/config', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  let config = readDB('config');
  config[0] = { ...config[0], ...req.body };
  writeDB('config', config);
  res.json(config[0]);
});

// ========== USER ANALYTICS ==========
app.get('/api/user/analytics', auth, (req, res) => {
  const users = readDB('users');
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404);
  const posts = readDB('posts').filter(p => p.authorId === req.userId);
  const memes = readDB('memes').filter(m => m.authorId === req.userId);
  const totalLikes = posts.reduce((acc,p) => acc + p.likes.length, 0) + memes.reduce((acc,m) => acc + m.likes.length,0);
  res.json({ postsCreated: user.postsCreated, bugsFixed: user.bugsFixed, likesReceived: totalLikes, xp: user.xp, level: user.level });
});

// ========== SERVE FRONTEND ==========
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/login', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// Start server
app.listen(PORT, () => console.log(`🚀 ERROR 404 Platform running on http://localhost:${PORT}`));