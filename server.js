// Simple Express + MongoDB Atlas backend for Sasnaka Aurudu app

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ---- Middleware ----
app.use(cors());
app.use(express.json({ limit: '10mb' })); // allow base64 images

// ---- Cloudinary Config ----
if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
} else {
  console.warn('Cloudinary config missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env');
}

// ---- MongoDB Connection ----
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.warn('MONGO_URI is not set. Please create a .env file with your MongoDB Atlas connection string.');
}

mongoose
  .connect(mongoUri, { dbName: process.env.MONGO_DB_NAME || 'sasnaka_aurudu_2026' })
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('MongoDB connection error:', err.message));

// ---- Auth Users (server-side only) ----
const AUTH_USERS = {
  superadmin: {
    username: process.env.SUPERADMIN_USER || 'superadmin',
    password: process.env.SUPERADMIN_PASS || 'munkathai@97',
    role: 'superadmin'
  },
  admin: {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || 'SaA26mit_345',
    role: 'admin'
  },
  judge: {
    username: process.env.JUDGE_USER || 'judge',
    password: process.env.JUDGE_PASS || 'Ncxvde_47062',
    role: 'judge'
  }
};

// ---- Mongoose Schema ----
const contestantSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ['kumara', 'kumariya'], required: true },
    name: { type: String, required: true },
    district: { type: String, required: true },
    age: { type: Number, required: true },
    photoDataUrl: { type: String, required: true },
    starred: { type: Boolean, default: false },
    scores: {
      type: Map,
      of: Number,
      default: {}
    },
    total: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

const Contestant = mongoose.model('Contestant', contestantSchema);

const requestSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['delete', 'edit'], required: true },
    contestantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    contestantName: { type: String, required: true },
    requestedBy: { type: String, required: true },
    note: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
  },
  { timestamps: true }
);

const ChangeRequest = mongoose.model('ChangeRequest', requestSchema);

function computeTotalFromMap(scoresMap) {
  return Array.from(scoresMap.values()).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
}

// ---- API Routes ----

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = AUTH_USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  res.json({ username: user.username, role: user.role });
});

// Get all contestants
app.get('/api/contestants', async (req, res) => {
  try {
    const contestants = await Contestant.find().sort({ createdAt: 1 });
    res.json(contestants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load contestants' });
  }
});

// Create contestant
app.post('/api/contestants', async (req, res) => {
  try {
    const { category, name, district, age, photoDataUrl } = req.body;
    if (!category || !name || !district || !age || !photoDataUrl) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (!cloudinary.config().cloud_name) {
      return res.status(500).json({ message: 'Image service is not configured' });
    }

    const uploadResult = await cloudinary.uploader.upload(photoDataUrl, {
      folder: 'aurudu-2026'
    });

    const contestant = new Contestant({
      category,
      name,
      district,
      age,
      photoDataUrl: uploadResult.secure_url,
      scores: {},
      total: 0
    });

    await contestant.save();
    res.status(201).json(contestant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create contestant' });
  }
});

// Update scores for a contestant
app.post('/api/contestants/:id/scores', async (req, res) => {
  try {
    const { id } = req.params;
    const { scores } = req.body; // { judge1: 8, judge2: 7, ... }

    if (!scores || typeof scores !== 'object') {
      return res.status(400).json({ message: 'Scores object is required' });
    }

    const contestant = await Contestant.findById(id);
    if (!contestant) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    Object.entries(scores).forEach(([key, value]) => {
      const v = Number(value);
      if (Number.isFinite(v) && v >= 0 && v <= 10) {
        contestant.scores.set(key, v);
      }
    });

    contestant.total = computeTotalFromMap(contestant.scores);
    await contestant.save();

    res.json(contestant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update scores' });
  }
});

// Update star flag for a contestant
app.post('/api/contestants/:id/star', async (req, res) => {
  try {
    const { id } = req.params;
    const { starred } = req.body || {};

    const contestant = await Contestant.findById(id);
    if (!contestant) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    contestant.starred = !!starred;
    await contestant.save();

    res.json(contestant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update star flag' });
  }
});

// Delete contestant
app.delete('/api/contestants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const contestant = await Contestant.findById(id);
    if (!contestant) {
      return res.status(404).json({ message: 'Contestant not found' });
    }

    // Log direct deletions as approved delete requests so they appear in the
    // "Removed Contestants" list, even when there was no admin request.
    try {
      const directRequest = new ChangeRequest({
        action: 'delete',
        contestantId: contestant._id,
        contestantName: contestant.name,
        requestedBy: 'superadmin',
        note: reason && reason.trim() ? reason.trim() : 'Deleted directly by superadmin',
        status: 'approved'
      });
      await directRequest.save();
    } catch (logErr) {
      console.error('Failed to log direct deletion request:', logErr);
      // continue with deletion even if logging fails
    }

    await contestant.deleteOne();
    res.json({ message: 'Contestant deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete contestant' });
  }
});

// Create change request (from admin)
app.post('/api/requests', async (req, res) => {
  try {
    const { action, contestantId, contestantName, requestedBy, note } = req.body || {};
    if (!action || !contestantId || !contestantName || !requestedBy) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (!['delete', 'edit'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const request = new ChangeRequest({
      action,
      contestantId,
      contestantName,
      requestedBy,
      note: note || ''
    });

    await request.save();
    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create request' });
  }
});

// List change requests (for superadmin)
app.get('/api/requests', async (req, res) => {
  try {
    const { status, action } = req.query;
    const query = {};
    if (status) query.status = status;
    if (action) query.action = action;

    const requests = await ChangeRequest.find(query).sort({ createdAt: 1 });
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load requests' });
  }
});

// Approve request
app.post('/api/requests/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ChangeRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    if (request.action === 'delete') {
      await Contestant.findByIdAndDelete(request.contestantId);
    }

    request.status = 'approved';
    await request.save();

    res.json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to approve request' });
  }
});

// Reject request
app.post('/api/requests/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ChangeRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request already processed' });
    }

    request.status = 'rejected';
    await request.save();

    res.json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to reject request' });
  }
});

// ---- Static Front-end ----
const publicDir = __dirname;
app.use(express.static(publicDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
