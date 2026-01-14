// ============================================================
// PLANT MONITOR BACKEND - RENDER READY (IN-MEMORY VERSION)
// Copy this ENTIRE file to replace your server.js - NO DATABASE SETUP REQUIRED!
// ============================================================

const express = require('express');
const cors = require('cors');
const app = express();

// ============== Configuration ==============
const PORT = process.env.PORT || 3000;

// ============== Middleware ==============
// Enable CORS for ESP32 and frontend
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${req.method} ${req.path}`);
  console.log('IP:', req.ip);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ============== In-Memory Storage ==============
let readings = [];
const MAX_READINGS = 1000;
let devices = {};

// ============== ROUTES ==============

// Health Check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: '🌱 Plant Monitor API is running!',
    version: '2.2.0-MEMORY',
    timestamp: new Date().toISOString(),
    statistics: {
      totalReadings: readings.length,
      totalDevices: Object.keys(devices).length,
      latestReading: readings[0]?.receivedAt || null
    }
  });
});

// POST - ESP32 sends data here
app.post('/api/readings', (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📥 NEW READING FROM ESP32');
    console.log('========================================');
    
    const { 
      deviceId, soilValue, ldrValue, soilCondition, lightCondition,
      wifiRSSI, freeHeap, sendAttempt, timestamp
    } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId' });
    }
    
    // Create reading
    const reading = {
      id: `reading_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deviceId,
      soilValue: parseInt(soilValue),
      ldrValue: parseInt(ldrValue),
      soilCondition: soilCondition || 'Unknown',
      lightCondition: lightCondition || 'Unknown',
      wifiRSSI: wifiRSSI ? parseInt(wifiRSSI) : null,
      freeHeap: freeHeap ? parseInt(freeHeap) : null,
      sendAttempt: sendAttempt ? parseInt(sendAttempt) : null,
      receivedAt: new Date().toISOString(),
      timestamp: timestamp || Date.now()
    };
    
    // Store (newest first)
    readings.unshift(reading);
    if (readings.length > MAX_READINGS) {
      readings = readings.slice(0, MAX_READINGS);
    }
    
    // Update device info
    if (!devices[deviceId]) {
      devices[deviceId] = { deviceId, firstSeen: new Date().toISOString(), totalReadings: 0 };
    }
    devices[deviceId].lastSeen = new Date().toISOString();
    devices[deviceId].totalReadings++;
    devices[deviceId].lastReading = reading;
    
    console.log('✅ SAVED:', deviceId, 'Soil:', soilValue, 'Light:', ldrValue);
    
    res.status(201).json({
      success: true,
      message: 'Data saved!',
      reading,
      stats: { totalReadings: readings.length }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Frontend fetches from here
app.get('/api/readings', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const deviceId = req.query.deviceId;
    
    let filtered = readings;
    if (deviceId) {
      filtered = readings.filter(r => r.deviceId === deviceId);
    }
    
    const result = filtered.slice(0, limit);
    
    res.json({
      success: true,
      count: result.length,
      total: filtered.length,
      readings: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Latest reading
app.get('/api/readings/latest', (req, res) => {
  const deviceId = req.query.deviceId;
  let latest = readings[0];
  
  if (deviceId) {
    latest = readings.find(r => r.deviceId === deviceId);
  }
  
  if (!latest) {
    return res.status(404).json({ success: false, message: 'No data yet' });
  }
  
  res.json({ success: true, reading: latest });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API working! 🎉' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// START SERVER
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🌱 PLANT MONITOR API v2.2 (In-Memory)');
  console.log('='.repeat(60));
  console.log(`🚀 Running on port ${PORT}`);
  console.log(`📍 Test: https://plant-monitor-api.onrender.com/api/test`);
  console.log(`📥 ESP32: POST /api/readings`);
  console.log(`📱 Frontend: GET /api/readings`);
  console.log('='.repeat(60));
  console.log('✅ READY! No database setup needed!');
});
