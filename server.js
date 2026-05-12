require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const cron = require('node-cron');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { OpenAI } = require('openai');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs-extra');
const auth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4040;
const SECRET = process.env.JWT_SECRET || '404_DEV_SECRET_GLITCH';

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable required');
  process.exit(1);
}
mongoose.connect(MONGODB_URI);
mongoose.connection.on('connected', () => console.log('✅ MongoDB connected'));
mongoose.connection.on('error', err => console.error('MongoDB error:', err));

// ========== SCHEMAS ==========
const userSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  username: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: 'user' },
  banned: { type: Boolean, default: false },
  profilePic: String,
  verifiedTick: { type: Boolean, default: false },
  bio: String,
  skills: [String],
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },
  xp: { type: Number, default: 0 },
  level: { type: String, default: 'Beginner Debugger' },
  postsCreated: { type: Number, default: 0 },
  bugsFixed: { type: Number, default: 0 },
  likesReceived: { type: Number, default: 0 },
  memesUploaded: { type: Number, default: 0 },
  emailVerified: { type: Boolean, default: true },
  twoFAEnabled: { type: Boolean, default: false },
  twoFASecret: String,
  createdAt: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  title: String,
  content: String,
  category: String,
  tags: [String],
  authorId: String,
  approved: { type: Boolean, default: false },
  likes: [String],
  savedBy: [String],
  createdAt: { type: Date, default: Date.now },
});

const memeSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  url: String,
  title: String,
  authorId: String,
  likes: [String],
  createdAt: { type: Date, default: Date.now },
});

const challengeSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  title: String,
  brokenCode: String,
  solution: String,
  difficulty: String,
  xpReward: Number,
});

const threadSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  title: String,
  content: String,
  category: String,
  authorId: String,
  comments: [{
    id: { type: String, default: uuidv4 },
    text: String,
    authorId: String,
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
});

const reportSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  reporterId: String,
  targetType: String,
  targetId: String,
  reason: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

const logSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  action: String,
  userId: String,
  details: String,
  timestamp: { type: Date, default: Date.now },
});

const configSchema = new mongoose.Schema({
  blogEnabled: { type: Boolean, default: true },
  memesEnabled: { type: Boolean, default: true },
  challengesEnabled: { type: Boolean, default: true },
});

const notificationSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  userId: String,
  message: String,
  type: String,
  read: { type: Boolean, default: false },
  relatedId: String,
  createdAt: { type: Date, default: Date.now },
});

const messageSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  from: String,
  to: String,
  text: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const followSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  followerId: String,
  followingId: String,
  createdAt: { type: Date, default: Date.now },
});

const leaderboardArchiveSchema = new mongoose.Schema({
  username: String,
  xp: Number,
  level: String,
  date: Date,
});

const groupSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  name: String,
  creatorId: String,
  genderType: { type: String, enum: ['boys', 'girls', 'mixed', 'all'], default: 'mixed' },
  members: [String],
  messages: [{
    id: { type: String, default: uuidv4 },
    from: String,
    text: String,
    createdAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
});

const feedbackSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  userId: String,
  username: String,
  message: String,
  rating: { type: Number, min: 1, max: 5, default: 0 },
  status: { type: String, default: 'pending' },
  adminReply: String,
  createdAt: { type: Date, default: Date.now },
});

const announcementSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  title: String,
  content: String,
  authorId: String,
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Meme = mongoose.model('Meme', memeSchema);
const Challenge = mongoose.model('Challenge', challengeSchema);
const Thread = mongoose.model('Thread', threadSchema);
const Report = mongoose.model('Report', reportSchema);
const Log = mongoose.model('Log', logSchema);
const Config = mongoose.model('Config', configSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Message = mongoose.model('Message', messageSchema);
const Follow = mongoose.model('Follow', followSchema);
const LeaderboardArchive = mongoose.model('LeaderboardArchive', leaderboardArchiveSchema);
const Group = mongoose.model('Group', groupSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);

// ========== INIT DEFAULT DATA ==========
async function initDefaultData() {
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    const adminPass = bcrypt.hashSync('ASHER01!?', 10);
    await User.create({
      username: 'error.404.ke',
      email: 'admin@error404.dev',
      password: adminPass,
      role: 'admin',
      bio: 'System Administrator',
      skills: ['JavaScript', 'Node.js', 'Cyber'],
      xp: 5000,
      level: '404 Master',
    });
    console.log('Admin user created');
  }
  const config = await Config.findOne();
  if (!config) await Config.create({});
  const challenges = await Challenge.countDocuments();
  if (challenges === 0) {
    await Challenge.insertMany([
      { id: 'ch1', title: 'Fix the sum function', brokenCode: 'function sum(a,b){ return a - b; }', solution: 'return a + b', difficulty: 'easy', xpReward: 50 },
      { id: 'ch2', title: 'Array double', brokenCode: 'const double = arr => arr.map(x => x * 3);', solution: 'arr.map(x => x * 2)', difficulty: 'easy', xpReward: 75 },
      { id: 'ch3', title: 'Palindrome check', brokenCode: 'function isPal(str){ return str === str.split("").reverse().join(""); }', solution: 'return str === str.split("").reverse().join("")', difficulty: 'medium', xpReward: 120 },
    ]);
    console.log('Default challenges created');
  }
}

async function addLog(action, userId, details) {
  try {
    await Log.create({ action, userId, details });
  } catch (err) { console.error('Log error:', err); }
}

// ========== MULTER (uploads) ==========
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

fs.ensureDirSync('./public/uploads/profiles');
fs.ensureDirSync('./public/uploads/memes');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ========== ONLINE USERS ==========
const onlineUsers = new Set();
app.post('/api/online', auth, (req, res) => { onlineUsers.add(req.userId); res.json({ online: Array.from(onlineUsers) }); });
app.post('/api/offline', auth, (req, res) => { onlineUsers.delete(req.userId); res.json({ success: true }); });
app.get('/api/online-users', auth, async (req, res) => {
  const users = await User.find({}, 'id username');
  const onlineList = Array.from(onlineUsers).map(id => {
    const u = users.find(u => u.id === id);
    return { id, username: u?.username };
  });
  res.json(onlineList);
});

// ========== AUTHENTICATION ==========
app.post('/api/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: 'Email already exists' });
  const hashed = bcrypt.hashSync(password, 10);
  const newUser = await User.create({ username, email, password: hashed });
  await addLog('signup', newUser.id, `User ${username} signed up`);
  const token = jwt.sign({ id: newUser.id, role: newUser.role }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: newUser.id, role: newUser.role, username, verifiedTick: false } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, remember, twoFAToken } = req.body;
  const user = await User.findOne({ email });
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
  const user = await User.findOne({ email });
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
  const user = await User.findOne({ id: userId });
  if (!user) return res.status(404);
  user.password = bcrypt.hashSync(newPassword, 10);
  await user.save();
  delete global.resetTokens[token];
  res.json({ message: 'Password updated' });
});

// ========== USER PROFILE ==========
app.post('/api/user/upload-profile', auth, uploadProfile.single('profilePic'), async (req, res) => {
  const user = await User.findOne({ id: req.userId });
  if (user) {
    if (user.profilePic) {
      const oldPath = path.join(__dirname, 'public', user.profilePic);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    user.profilePic = `/uploads/profiles/${req.file.filename}`;
    user.verifiedTick = true;
    await user.save();
    await addLog('upload_profile', req.userId, 'Profile picture uploaded');
    res.json({ profilePic: user.profilePic, verifiedTick: true });
  } else res.status(404);
});

app.delete('/api/user/delete-account', auth, async (req, res) => {
  const userId = req.userId;
  await User.deleteOne({ id: userId });
  await Post.deleteMany({ authorId: userId });
  await Meme.deleteMany({ authorId: userId });
  await Thread.deleteMany({ authorId: userId });
  await addLog('delete_account', userId, 'Account deleted');
  res.json({ message: 'Account deleted' });
});

app.get('/api/user/profile', auth, async (req, res) => {
  const user = await User.findOne({ id: req.userId }, { password: 0, twoFASecret: 0 });
  if (user) res.json(user);
  else res.status(404);
});

app.put('/api/user/profile', auth, async (req, res) => {
  const user = await User.findOne({ id: req.userId });
  if (user) {
    const { username, bio, skills, gender } = req.body;
    if (username) user.username = username;
    if (bio) user.bio = bio;
    if (skills) user.skills = skills.split(',').map(s => s.trim());
    if (gender) user.gender = gender;
    await user.save();
    res.json({ success: true });
  } else res.status(404);
});

app.post('/api/user/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findOne({ id: req.userId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(401).json({ error: 'Current password is incorrect' });
  user.password = bcrypt.hashSync(newPassword, 10);
  await user.save();
  await addLog('change_password', req.userId, 'Password changed');
  res.json({ message: 'Password updated successfully' });
});

app.post('/api/user/2fa/setup', auth, async (req, res) => {
  const secret = speakeasy.generateSecret({ length: 20, name: `404Dev:${req.userId}` });
  const user = await User.findOne({ id: req.userId });
  user.twoFASecret = secret.base32;
  await user.save();
  QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
    if (err) return res.status(500).json({ error: 'QR generation failed' });
    res.json({ secret: secret.base32, qr: data_url });
  });
});

app.post('/api/user/2fa/verify', auth, async (req, res) => {
  const { token } = req.body;
  const user = await User.findOne({ id: req.userId });
  const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: 'base32', token });
  if (verified) {
    user.twoFAEnabled = true;
    await user.save();
    res.json({ success: true });
  } else res.status(400).json({ error: 'Invalid token' });
});

app.get('/api/user/export-data', auth, async (req, res) => {
  const user = await User.findOne({ id: req.userId }, { password: 0, twoFASecret: 0 });
  const posts = await Post.find({ authorId: req.userId });
  const memes = await Meme.find({ authorId: req.userId });
  const threads = await Thread.find({ authorId: req.userId });
  const messages = await Message.find({ $or: [{ from: req.userId }, { to: req.userId }] });
  const exportData = { user: user.toObject(), posts, memes, threads, messages };
  res.setHeader('Content-Disposition', 'attachment; filename="my-404dev-data.json"');
  res.json(exportData);
});

// ========== BLOG ==========
app.get('/api/posts', async (req, res) => {
  const config = await Config.findOne();
  if (!config.blogEnabled) return res.json([]);
  const posts = await Post.find({ approved: true }).lean();
  const users = await User.find({}, 'id username verifiedTick');
  const enriched = posts.map(p => {
    const author = users.find(u => u.id === p.authorId);
    return { ...p, authorName: author?.username, authorVerified: author?.verifiedTick || false };
  });
  res.json(enriched);
});

app.get('/api/posts/all', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const posts = await Post.find().lean();
  const users = await User.find({}, 'id username');
  const enriched = posts.map(p => ({ ...p, authorName: users.find(u => u.id === p.authorId)?.username }));
  res.json(enriched);
});

app.post('/api/posts', auth, async (req, res) => {
  const { title, content, category, tags } = req.body;
  const newPost = await Post.create({
    title,
    content,
    category: category || 'Tutorials',
    tags: tags ? tags.split(',') : [],
    authorId: req.userId,
    approved: false,
  });
  await User.updateOne({ id: req.userId }, { $inc: { postsCreated: 1 } });
  await addLog('create_post', req.userId, `Post: ${title}`);
  res.json(newPost);
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  const post = await Post.findOne({ id: req.params.id });
  if (!post) return res.status(404);
  const user = await User.findOne({ id: req.userId });
  if (user.role === 'admin' || post.authorId === req.userId) {
    await Post.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } else res.status(403);
});

app.post('/api/posts/:id/like', auth, async (req, res) => {
  const post = await Post.findOne({ id: req.params.id });
  if (!post) return res.status(404);
  if (post.likes.includes(req.userId)) post.likes = post.likes.filter(id => id !== req.userId);
  else post.likes.push(req.userId);
  await post.save();
  res.json({ likes: post.likes.length });
});

app.post('/api/posts/:id/save', auth, async (req, res) => {
  const post = await Post.findOne({ id: req.params.id });
  if (!post) return res.status(404);
  if (post.savedBy.includes(req.userId)) post.savedBy = post.savedBy.filter(id => id !== req.userId);
  else post.savedBy.push(req.userId);
  await post.save();
  res.json({ saved: !post.savedBy.includes(req.userId) });
});

app.get('/api/user/saved-posts', auth, async (req, res) => {
  const posts = await Post.find({ savedBy: req.userId });
  res.json(posts);
});

app.put('/api/admin/posts/:id/approve', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  await Post.updateOne({ id: req.params.id }, { approved: true });
  res.json({ approved: true });
});

// ========== MEMES ==========
app.post('/api/memes/upload', auth, uploadMeme.single('meme'), async (req, res) => {
  const meme = await Meme.create({
    url: `/uploads/memes/${req.file.filename}`,
    title: req.body.title,
    authorId: req.userId,
  });
  await User.updateOne({ id: req.userId }, { $inc: { memesUploaded: 1 } });
  res.json(meme);
});

app.get('/api/memes', async (req, res) => {
  const config = await Config.findOne();
  if (!config.memesEnabled) return res.json([]);
  const memes = await Meme.find().lean();
  const users = await User.find({}, 'id username verifiedTick');
  const enriched = memes.map(m => ({ ...m, authorName: users.find(u => u.id === m.authorId)?.username, authorVerified: users.find(u => u.id === m.authorId)?.verifiedTick || false }));
  res.json(enriched);
});

app.post('/api/memes/:id/like', auth, async (req, res) => {
  const meme = await Meme.findOne({ id: req.params.id });
  if (!meme) return res.status(404);
  if (meme.likes.includes(req.userId)) meme.likes = meme.likes.filter(id => id !== req.userId);
  else meme.likes.push(req.userId);
  await meme.save();
  res.json({ likes: meme.likes.length });
});

// ========== DEBUG ARENA ==========
app.get('/api/challenges', async (req, res) => {
  const config = await Config.findOne();
  if (!config.challengesEnabled) return res.json([]);
  const challenges = await Challenge.find();
  res.json(challenges);
});

app.post('/api/challenges/submit', auth, async (req, res) => {
  const { challengeId, userSolution } = req.body;
  const challenge = await Challenge.findOne({ id: challengeId });
  if (!challenge) return res.status(404);
  const user = await User.findOne({ id: req.userId });
  const correct = userSolution.trim() === challenge.solution;
  if (correct) {
    user.xp += challenge.xpReward;
    user.bugsFixed += 1;
    if (user.xp >= 1000) user.level = '404 Master';
    else if (user.xp >= 500) user.level = 'Error Slayer';
    else if (user.xp >= 200) user.level = 'Bug Hunter';
    else user.level = 'Beginner Debugger';
    await user.save();
    await addLog('challenge_solved', req.userId, `Solved ${challenge.title}`);
    res.json({ correct: true, xpGained: challenge.xpReward, newLevel: user.level });
  } else res.json({ correct: false });
});

app.get('/api/leaderboard', async (req, res) => {
  const users = await User.find().sort({ xp: -1 }).limit(10).select('username xp level verifiedTick');
  res.json(users);
});

// ========== FORUM ==========
app.get('/api/threads', async (req, res) => {
  const threads = await Thread.find().lean();
  const users = await User.find({}, 'id username verifiedTick');
  const enriched = threads.map(t => ({ ...t, authorName: users.find(u => u.id === t.authorId)?.username, authorVerified: users.find(u => u.id === t.authorId)?.verifiedTick || false }));
  res.json(enriched);
});

app.post('/api/threads', auth, async (req, res) => {
  const { title, content, category } = req.body;
  const thread = await Thread.create({ title, content, category: category || 'General', authorId: req.userId });
  res.json(thread);
});

app.post('/api/threads/:id/comment', auth, async (req, res) => {
  const thread = await Thread.findOne({ id: req.params.id });
  if (!thread) return res.status(404);
  thread.comments.push({ text: req.body.text, authorId: req.userId });
  await thread.save();
  res.json(thread.comments[thread.comments.length - 1]);
});

// ========== REPORTS ==========
app.post('/api/reports', auth, async (req, res) => {
  await Report.create({ reporterId: req.userId, targetType: req.body.targetType, targetId: req.body.targetId, reason: req.body.reason });
  res.json({ success: true });
});

app.get('/api/reports', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const reports = await Report.find().lean();
  const users = await User.find({}, 'id username');
  const enriched = reports.map(r => ({ ...r, reporterName: users.find(u => u.id === r.reporterId)?.username }));
  res.json(enriched);
});

// ========== NOTIFICATIONS ==========
app.post('/api/notifications', auth, async (req, res) => {
  const notif = await Notification.create(req.body);
  res.json(notif);
});
app.get('/api/notifications', auth, async (req, res) => {
  const notifs = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json(notifs);
});
app.put('/api/notifications/:id/read', auth, async (req, res) => {
  await Notification.updateOne({ id: req.params.id, userId: req.userId }, { read: true });
  res.json({ success: true });
});

// ========== MESSAGES & GROUPS ==========
app.get('/api/conversations', auth, async (req, res) => {
  const messages = await Message.find({ $or: [{ from: req.userId }, { to: req.userId }] }).lean();
  const users = await User.find({}, 'id username');
  const convMap = new Map();
  messages.forEach(m => {
    const other = m.from === req.userId ? m.to : m.from;
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

app.get('/api/messages/:userId', auth, async (req, res) => {
  const messages = await Message.find({
    $or: [
      { from: req.userId, to: req.params.userId },
      { from: req.params.userId, to: req.userId }
    ]
  }).sort({ createdAt: 1 });
  res.json(messages);
});

app.post('/api/messages', auth, async (req, res) => {
  const { to, text } = req.body;
  const newMsg = await Message.create({ from: req.userId, to, text });
  await Notification.create({ userId: to, message: `New message from ${req.userId}`, type: 'message', relatedId: newMsg.id });
  res.json(newMsg);
});

// GROUPS (User & Admin)
app.get('/api/groups', auth, async (req, res) => {
  const groups = await Group.find({ members: req.userId });
  res.json(groups);
});

app.get('/api/admin/groups', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const groups = await Group.find();
  res.json(groups);
});

app.post('/api/admin/groups', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { name, genderType } = req.body;
  const newGroup = await Group.create({
    name,
    creatorId: req.userId,
    genderType: genderType || 'mixed',
    members: [req.userId],
  });
  res.json(newGroup);
});

app.post('/api/admin/groups/:groupId/add-members', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { memberIds } = req.body;
  const group = await Group.findOne({ id: req.params.groupId });
  if (!group) return res.status(404);
  memberIds.forEach(id => {
    if (!group.members.includes(id)) group.members.push(id);
  });
  await group.save();
  res.json(group);
});

app.delete('/api/admin/groups/:groupId/members/:userId', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const group = await Group.findOne({ id: req.params.groupId });
  if (!group) return res.status(404);
  group.members = group.members.filter(m => m !== req.params.userId);
  await group.save();
  res.json(group);
});

app.post('/api/groups/:groupId/message', auth, async (req, res) => {
  const group = await Group.findOne({ id: req.params.groupId });
  if (!group) return res.status(404);
  if (!group.members.includes(req.userId)) return res.status(403);
  group.messages.push({ from: req.userId, text: req.body.text });
  await group.save();
  res.json(group.messages[group.messages.length - 1]);
});

app.get('/api/groups/:groupId/messages', auth, async (req, res) => {
  const group = await Group.findOne({ id: req.params.groupId });
  if (!group) return res.status(404);
  if (!group.members.includes(req.userId)) return res.status(403);
  res.json(group.messages || []);
});

// ========== ANNOUNCEMENTS ==========
app.get('/api/announcements', auth, async (req, res) => {
  const announcements = await Announcement.find().sort({ createdAt: -1 });
  res.json(announcements);
});

app.post('/api/admin/announcements', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { title, content, priority } = req.body;
  const announcement = await Announcement.create({
    title,
    content,
    authorId: req.userId,
    priority: priority || 'medium',
  });
  res.json(announcement);
});

app.delete('/api/admin/announcements/:id', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  await Announcement.deleteOne({ id: req.params.id });
  res.json({ success: true });
});

// ========== FEEDBACK ==========
app.post('/api/feedback', auth, async (req, res) => {
  const { message, rating } = req.body;
  const user = await User.findOne({ id: req.userId });
  if (!user) return res.status(404);
  const feedback = await Feedback.create({
    userId: req.userId,
    username: user.username,
    message,
    rating: rating || 0,
  });
  res.json(feedback);
});

app.get('/api/admin/feedback', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const feedbacks = await Feedback.find().sort({ createdAt: -1 });
  res.json(feedbacks);
});

app.put('/api/admin/feedback/:id/reply', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { reply } = req.body;
  const feedback = await Feedback.findOne({ id: req.params.id });
  if (!feedback) return res.status(404);
  feedback.adminReply = reply;
  feedback.status = 'reviewed';
  await feedback.save();
  res.json({ success: true });
});

// ========== FOLLOWS ==========
app.post('/api/follow/:userId', auth, async (req, res) => {
  const existing = await Follow.findOne({ followerId: req.userId, followingId: req.params.userId });
  if (existing) await Follow.deleteOne({ id: existing.id });
  else await Follow.create({ followerId: req.userId, followingId: req.params.userId });
  res.json({ following: !existing });
});

app.get('/api/followers/:userId', auth, async (req, res) => {
  const followers = await Follow.find({ followingId: req.params.userId }).select('followerId');
  const following = await Follow.find({ followerId: req.params.userId }).select('followingId');
  const users = await User.find({}, 'id username');
  const followerNames = followers.map(f => users.find(u => u.id === f.followerId)?.username);
  const followingNames = following.map(f => users.find(u => u.id === f.followingId)?.username);
  res.json({ followers: followerNames, following: followingNames });
});

// ========== CODE EXECUTION ==========
app.post('/api/execute', auth, async (req, res) => {
  const { language, code, stdin } = req.body;
  const langMap = { javascript: 'js', python: 'py' };
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

// ========== AI DEBUG ==========
let openai = null;
if (process.env.OPENAI_API_KEY) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.post('/api/ai-debug', auth, async (req, res) => {
  if (!openai) return res.status(501).json({ error: 'OpenAI API not configured' });
  const { code, error } = req.body;
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
cron.schedule('0 0 * * 0', async () => {
  const users = await User.find().select('username xp level');
  for (const user of users) {
    await LeaderboardArchive.create({ username: user.username, xp: user.xp, level: user.level, date: new Date() });
  }
  console.log('Weekly leaderboard archived.');
});

app.get('/api/leaderboard/archive', async (req, res) => {
  const archive = await LeaderboardArchive.find().sort({ date: -1 }).limit(100);
  res.json(archive);
});

// ========== ADMIN PANEL STATS & MANAGEMENT ==========
app.get('/api/admin/stats', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ xp: { $gt: 0 } });
  const totalPosts = await Post.countDocuments();
  const pendingPosts = await Post.countDocuments({ approved: false });
  const totalMemes = await Meme.countDocuments();
  const openReports = await Report.countDocuments({ status: 'pending' });
  res.json({ totalUsers, activeUsers, totalPosts, pendingPosts, totalMemes, openReports });
});

app.get('/api/admin/users', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const users = await User.find({}, { password: 0, twoFASecret: 0 });
  res.json(users);
});

app.post('/api/admin/users', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { username, email, password, role } = req.body;
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: 'Email exists' });
  const newUser = await User.create({ username, email, password: bcrypt.hashSync(password, 10), role: role || 'user' });
  res.json({ id: newUser.id, username, email, role: newUser.role });
});

app.put('/api/admin/users/:id/ban', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const user = await User.findOne({ id: req.params.id });
  if (user) {
    user.banned = !user.banned;
    await user.save();
  }
  res.json({ banned: user?.banned });
});

app.put('/api/admin/users/:id/role', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { role } = req.body;
  await User.updateOne({ id: req.params.id }, { role });
  res.json({ role });
});

app.delete('/api/admin/users/:id', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const userId = req.params.id;
  await User.deleteOne({ id: userId });
  await Post.deleteMany({ authorId: userId });
  await Meme.deleteMany({ authorId: userId });
  await Thread.deleteMany({ authorId: userId });
  res.json({ success: true });
});

app.get('/api/admin/logs', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const logs = await Log.find().sort({ timestamp: -1 }).limit(100);
  res.json(logs);
});

app.delete('/api/admin/memes/:id', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  await Meme.deleteOne({ id: req.params.id });
  res.json({ success: true });
});

app.get('/api/comments/all', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const threads = await Thread.find().lean();
  let allComments = [];
  threads.forEach(thread => {
    thread.comments.forEach(c => {
      allComments.push({ ...c, postTitle: thread.title, postId: thread.id });
    });
  });
  const users = await User.find({}, 'id username');
  const enriched = allComments.map(c => ({ ...c, authorName: users.find(u => u.id === c.authorId)?.username }));
  res.json(enriched);
});

app.delete('/api/admin/comments/:id', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  await Thread.updateMany({}, { $pull: { comments: { id: req.params.id } } });
  res.json({ success: true });
});

app.put('/api/admin/reports/:id/resolve', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  await Report.updateOne({ id: req.params.id }, { status: 'resolved' });
  res.json({ success: true });
});

app.get('/api/admin/config', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const config = await Config.findOne();
  res.json(config);
});

app.put('/api/admin/config', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  await Config.updateOne({}, req.body, { upsert: true });
  res.json(req.body);
});

// ========== USER ANALYTICS ==========
app.get('/api/user/analytics', auth, async (req, res) => {
  const user = await User.findOne({ id: req.userId });
  if (!user) return res.status(404);
  const posts = await Post.find({ authorId: req.userId });
  const memes = await Meme.find({ authorId: req.userId });
  const totalLikes = posts.reduce((acc, p) => acc + p.likes.length, 0) + memes.reduce((acc, m) => acc + m.likes.length, 0);
  res.json({ postsCreated: user.postsCreated, bugsFixed: user.bugsFixed, likesReceived: totalLikes, xp: user.xp, level: user.level });
});

// ========== ADMIN CREATE CHALLENGES ==========
app.post('/api/admin/challenges', auth, async (req, res) => {
  if (req.role !== 'admin') return res.status(403);
  const { title, brokenCode, solution, difficulty, xpReward } = req.body;
  const newChallenge = {
    id: uuidv4(),
    title,
    brokenCode,
    solution,
    difficulty: difficulty || 'medium',
    xpReward: xpReward || 50,
  };
  await Challenge.create(newChallenge);
  res.json(newChallenge);
});

// ========== USER CHALLENGE PROGRESS (track solved status) ==========
// Add to userSchema:  completedChallenges: [String] (store challenge ids)
// And lastChallengeReset: Date (to know when they finished all)
// Already in MongoDB? We'll update User model:
// Add these fields to userSchema:
//   completedChallenges: { type: [String], default: [] },
//   allChallengesCompletedAt: { type: Date, default: null },
// Then modify /api/challenges/submit to check date and block.

// First, modify the userSchema (add fields):
// Add after twoFAEnabled:
//   completedChallenges: { type: [String], default: [] },
//   allChallengesCompletedAt: { type: Date, default: null },

// Then modify /api/challenges/submit:
// After user finds, check if user.allChallengesCompletedAt is not null and it's still the same week (Sunday reset)
// If yes, return { correct: false, message: "You've already completed all challenges this week. New challenges arrive Sunday!" }

// Also modify /api/challenges to return only challenges not yet solved by user (or all but mark solved)
// For simplicity, return all challenges; frontend will filter based on user's completedChallenges.

// Add endpoint to get user progress:
app.get('/api/user/challenge-progress', auth, async (req, res) => {
  const user = await User.findOne({ id: req.userId });
  if (!user) return res.status(404);
  res.json({ completed: user.completedChallenges || [], completedAll: user.allChallengesCompletedAt ? new Date(user.allChallengesCompletedAt) : null });
});

// ========== SERVE STATIC PAGES ==========
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start server after MongoDB connection
mongoose.connection.once('open', async () => {
  await initDefaultData();
  app.listen(PORT, () => console.log(`🚀 ERROR 404 Platform running on http://localhost:${PORT}`));
});