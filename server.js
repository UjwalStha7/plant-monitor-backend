// ============================================================
// PLANT MONITOR BACKEND - COMPLETE WORKING VERSION WITH MONGODB
// Copy this ENTIRE file to replace your server.js
// ============================================================

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();

// ============== Configuration ==============
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/plantmonitor';

// ============== MongoDB Schema ==============
const readingSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  soilValue: { type: Number, required: true },
  ldrValue: { type: Number, required: true },
  soilCondition: { type: String, default: 'Unknown' },
  lightCondition: { type: String, default: 'Unknown' },
  wifiRSSI: Number,
  freeHeap: Number,
  sendAttempt: Number,
  timestamp: { type: Number, default: Date.now },
  receivedAt: { type: Date, default: Date.now, index: true }
}, { 
  timestamps: true,
  collection: 'readings'
});

const Reading = mongoose.model('Reading', readingSchema);

// ============== Middleware ==============
// CRITICAL: Enable CORS for ESP32 and frontend
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${req.method} ${req.path}`);
  console.log('IP:', req.ip);
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ============== MongoDB Connection ==============
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB Connected!');
  } catch (error) {
    console.error('❌ MongoDB Connection Failed:', error);
    process.exit(1);
  }
}

// ============== ROUTES ==============

// ============== ROOT ROUTE (Health Check) ==============
app.get('/', async (req, res) => {
  try {
    const count = await Reading.countDocuments();
    const latest = await Reading.findOne().sort({ receivedAt: -1 });
    
    res.json({
      status: 'online',
      message: '🌱 Plant Monitor API is running!',
      version: '2.1.0-MONGO',
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      statistics: {
        totalReadings: count,
        latestReading: latest ? latest.receivedAt : null
      },
      endpoints: {
        postReading: { method: 'POST', path: '/api/readings' },
        getAllReadings: { method: 'GET', path: '/api/readings' },
        getLatest: { method: 'GET', path: '/api/readings/latest' },
        getDevice: { method: 'GET', path: '/api/readings/:deviceId' }
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============== POST READING (ESP32 Endpoint) ==============
app.post('/api/readings', async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📥 NEW READING RECEIVED FROM ESP32');
    console.log('========================================');
    
    const { 
      deviceId, soilValue, ldrValue, soilCondition, lightCondition,
      wifiRSSI, freeHeap, sendAttempt, timestamp
    } = req.body;
    
    // Validate required fields
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId' });
    }
    if (soilValue === undefined || ldrValue === undefined) {
      return res.status(400).json({ success: false, error: 'Missing sensor values' });
    }
    
    // Create and save reading
    const reading = new Reading({
      deviceId,
      soilValue: parseInt(soilValue),
      ldrValue: parseInt(ldrValue),
      soilCondition: soilCondition || 'Unknown',
      lightCondition: lightCondition || 'Unknown',
      wifiRSSI: wifiRSSI ? parseInt(wifiRSSI) : null,
      freeHeap: freeHeap ? parseInt(freeHeap) : null,
      sendAttempt: sendAttempt ? parseInt(sendAttempt) : null,
      timestamp: timestamp || Date.now()
    });
    
    await reading.save();
    
    console.log('✅ Reading saved to MongoDB!');
    console.log('Device:', deviceId);
    console.log('Soil:', soilValue, '→', soilCondition);
    console.log('Light:', ldrValue, '→', lightCondition);
    
    res.status(201).json({
      success: true,
      message: 'Reading saved successfully',
      readingId: reading._id,
      reading
    });
    
  } catch (error) {
    console.error('❌ Error saving reading:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== GET ALL READINGS (FRONTEND ENDPOINT) ==============
app.get('/api/readings', async (req, res) => {
  try {
    const { limit = 100, deviceId, skip = 0 } = req.query;
    
    const query = deviceId ? { deviceId } : {};
    const readings = await Reading.find(query)
      .sort({ receivedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Reading.countDocuments(query);
    
    res.json({
      success: true,
      count: readings.length,
      total,
      readings
    });
    
  } catch (error) {
    console.error('Error fetching readings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== GET LATEST READING ==============
app.get('/api/readings/latest', async (req, res) => {
  try {
    const { deviceId } = req.query;
    
    const latest = await Reading.find(deviceId ? { deviceId } : {})
      .sort({ receivedAt: -1 })
      .limit(1);
    
    if (!latest.length) {
      return res.status(404).json({ success: false, message: 'No readings found' });
    }
    
    res.json({
      success: true,
      reading: latest[0]
    });
    
  } catch (error) {
    console.error('Error fetching latest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== GET DEVICE READINGS ==============
app.get('/api/readings/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 100 } = req.query;
    
    const readings = await Reading.find({ deviceId })
      .sort({ receivedAt: -1 })
      .limit(parseInt(limit));
    
    if (!readings.length) {
      return res.status(404).json({ success: false, message: `No readings for ${deviceId}` });
    }
    
    res.json({
      success: true,
      deviceId,
      count: readings.length,
      readings
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== 404 Handler ==============
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// ============== START SERVER ==============
async function startServer() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🌱 PLANT MONITOR API v2.1 (MongoDB)');
    console.log('='.repeat(60));
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`📊 MongoDB: Connected`);
    console.log(`📍 Test: http://localhost:${PORT}/api/test`); // Add test endpoint if needed
    console.log('='.repeat(60));
    console.log('✅ READY - ESP32 → Backend → Frontend flow complete!');
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});
