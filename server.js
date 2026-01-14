// server.js - Plant Monitor Backend API
// This is what your backend SHOULD look like

const express = require('express');
const cors = require('cors');
const app = express();

// ============== Configuration ==============
const PORT = process.env.PORT || 3000;

// ============== Middleware ==============
// CRITICAL: Enable CORS for ESP32 and frontend
app.use(cors({
  origin: '*', // Allow all origins (adjust for production)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

// Parse JSON bodies
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ============== In-Memory Storage ==============
// For production, use MongoDB or PostgreSQL
let readings = [];
const MAX_READINGS = 1000; // Keep last 1000 readings

// ============== API Routes ==============

// Health check - TEST THIS FIRST
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Plant Monitor API is running',
    timestamp: new Date().toISOString(),
    totalReadings: readings.length,
    endpoints: {
      health: 'GET /',
      postReading: 'POST /api/readings',
      getAllReadings: 'GET /api/readings',
      getLatest: 'GET /api/readings/latest',
      getByDevice: 'GET /api/readings/:deviceId'
    }
  });
});

// POST endpoint - ESP32 sends data here
app.post('/api/readings', (req, res) => {
  try {
    console.log('\n=== NEW READING RECEIVED ===');
    console.log('From IP:', req.ip);
    console.log('Data:', req.body);
    
    const { 
      deviceId, 
      soilValue, 
      ldrValue, 
      soilCondition, 
      lightCondition,
      wifiRSSI,
      freeHeap,
      sendAttempt
    } = req.body;
    
    // Validate required fields
    if (!deviceId || soilValue === undefined || ldrValue === undefined) {
      console.error('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceId, soilValue, ldrValue'
      });
    }
    
    // Create reading object
    const reading = {
      id: Date.now().toString(),
      deviceId,
      soilValue: parseInt(soilValue),
      ldrValue: parseInt(ldrValue),
      soilCondition: soilCondition || 'Unknown',
      lightCondition: lightCondition || 'Unknown',
      wifiRSSI: wifiRSSI || null,
      freeHeap: freeHeap || null,
      sendAttempt: sendAttempt || null,
      receivedAt: new Date().toISOString(),
      timestamp: req.body.timestamp || Date.now()
    };
    
    // Add to storage
    readings.unshift(reading); // Add to beginning
    
    // Keep only last MAX_READINGS
    if (readings.length > MAX_READINGS) {
      readings = readings.slice(0, MAX_READINGS);
    }
    
    console.log('✅ Reading saved successfully');
    console.log('Total readings:', readings.length);
    console.log('============================\n');
    
    // Send success response
    res.status(201).json({
      success: true,
      message: 'Reading received successfully',
      reading: reading,
      totalReadings: readings.length
    });
    
  } catch (error) {
    console.error('❌ Error processing reading:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET all readings
app.get('/api/readings', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const deviceId = req.query.deviceId;
  
  let filteredReadings = readings;
  
  // Filter by deviceId if provided
  if (deviceId) {
    filteredReadings = readings.filter(r => r.deviceId === deviceId);
  }
  
  res.json({
    success: true,
    count: filteredReadings.length,
    readings: filteredReadings.slice(0, limit)
  });
});

// GET latest reading
app.get('/api/readings/latest', (req, res) => {
  const deviceId = req.query.deviceId;
  
  let latestReading;
  
  if (deviceId) {
    latestReading = readings.find(r => r.deviceId === deviceId);
  } else {
    latestReading = readings[0];
  }
  
  if (!latestReading) {
    return res.status(404).json({
      success: false,
      message: 'No readings found'
    });
  }
  
  res.json({
    success: true,
    reading: latestReading
  });
});

// GET readings by device
app.get('/api/readings/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  
  const deviceReadings = readings
    .filter(r => r.deviceId === deviceId)
    .slice(0, limit);
  
  if (deviceReadings.length === 0) {
    return res.status(404).json({
      success: false,
      message: `No readings found for device: ${deviceId}`
    });
  }
  
  res.json({
    success: true,
    deviceId,
    count: deviceReadings.length,
    readings: deviceReadings
  });
});

// DELETE all readings (for testing)
app.delete('/api/readings', (req, res) => {
  const count = readings.length;
  readings = [];
  
  res.json({
    success: true,
    message: `Deleted ${count} readings`
  });
});

// ============== Error Handling ==============

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    availableEndpoints: [
      'GET /',
      'POST /api/readings',
      'GET /api/readings',
      'GET /api/readings/latest',
      'GET /api/readings/:deviceId'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// ============== Start Server ==============

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🌱 PLANT MONITOR API SERVER');
  console.log('='.repeat(50));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /                        - Health check`);
  console.log(`   POST /api/readings            - Add reading`);
  console.log(`   GET  /api/readings            - Get all readings`);
  console.log(`   GET  /api/readings/latest     - Get latest reading`);
  console.log(`   GET  /api/readings/:deviceId  - Get device readings`);
  console.log('='.repeat(50) + '\n');
  console.log('🎯 Ready to receive data from ESP32!');
  console.log('💡 Test with: curl http://localhost:' + PORT);
  console.log('\n');
});

// ============== Graceful Shutdown ==============

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  process.exit(0);
});
