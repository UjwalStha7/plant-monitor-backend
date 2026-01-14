// ============================================================
// PLANT MONITOR BACKEND - VERCEL READY (IN-MEMORY VERSION)
// Copy this ENTIRE file to replace your server.js - FULLY FIXED!
// ============================================================

const express = require('express');
const cors = require('cors');
const app = express();

// ============== Configuration ==============
const PORT = process.env.PORT || 3000;

// ============== Middleware ==============
// FIXED CORS - Specific for your Vercel frontend + ESP32
app.use(cors({
  origin: [
    'https://plant-monitor-frontend-mu.vercel.app',
    'http://localhost:3000', 
    'http://localhost:3001'
  ],
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
    version: '2.3.0-VERCEL',
    timestamp: new Date().toISOString(),
    statistics: {
      totalReadings: readings.length,
      totalDevices: Object.keys(devices).length,
      latestReading: readings[0]?.receivedAt || null
    }
  });
});

// POST - ESP32 sends data here (KEEP SAME)
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

// ✅ NEW/ FIXED: Frontend fetches ALL data from here
app.get('/api/sensor-data', (req, res) => {
  try {
    console.log('📱 Frontend requesting sensor data');
    const limit = parseInt(req.query.limit) || 50;
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: readings.length,
      latest: readings[0],
      data: readings.slice(0, limit).map(r => ({
        soilValue: r.soilValue,
        ldrValue: r.ldrValue,
        soilCondition: r.soilCondition,
        lightCondition: r.lightCondition,
        timestamp: r.receivedAt,
        deviceId: r.deviceId
      }))
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Latest reading (KEEP)
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

// Vercel serverless function export (REQUIRED FOR VERCEL)
module.exports = app;

// START SERVER (Traditional hosting)
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🌱 PLANT MONITOR API v2.3 (Vercel Ready)');
  console.log('='.repeat(60));
  console.log(`🚀 Running on port ${PORT}`);
  console.log(`📱 Frontend endpoint: /api/sensor-data`);
  console.log(`📥 ESP32 POST: /api/readings`);
  console.log('='.repeat(60));
});
