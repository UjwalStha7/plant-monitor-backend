// ============================================================
// PLANT MONITOR BACKEND - COMPLETE WORKING VERSION
// Copy this ENTIRE file to replace your server.js
// ============================================================

const express = require('express');
const cors = require('cors');
const app = express();

// ============== Configuration ==============
const PORT = process.env.PORT || 3000;

// ============== Middleware ==============
// CRITICAL: Enable CORS for ESP32 and frontend
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[$${timestamp}] ${req.method} ${req.path}`);
  console.log('IP:', req.ip);
  console.log('User-Agent:', req.get('user-agent'));
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ============== In-Memory Storage ==============
let readings = [];
const MAX_READINGS = 1000;

// Store device metadata
let devices = {};

// ============== ROUTES ==============

// ============== ROOT ROUTE (Health Check) ==============
app.get('/', (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  res.json({
    status: 'online',
    message: '🌱 Plant Monitor API is running!',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    statistics: {
      totalReadings: readings.length,
      totalDevices: Object.keys(devices).length,
      oldestReading: readings.length > 0 ? readings[readings.length - 1].receivedAt : null,
      latestReading: readings.length > 0 ? readings[0].receivedAt : null
    },
    endpoints: {
      health: {
        method: 'GET',
        path: '/',
        description: 'Health check and API info'
      },
      postReading: {
        method: 'POST',
        path: '/api/readings',
        description: 'Submit sensor reading from ESP32'
      },
      getAllReadings: {
        method: 'GET',
        path: '/api/readings',
        description: 'Get all readings (with optional limit and deviceId filter)'
      },
      getLatestReading: {
        method: 'GET',
        path: '/api/readings/latest',
        description: 'Get the most recent reading'
      },
      getDeviceReadings: {
        method: 'GET',
        path: '/api/readings/:deviceId',
        description: 'Get readings for a specific device'
      },
      getDevices: {
        method: 'GET',
        path: '/api/devices',
        description: 'Get list of all devices'
      }
    },
    usage: {
      postExample: 'POST /api/readings with JSON body',
      getExample: 'GET /api/readings?limit=10&deviceId=ESP32_001'
    }
  });
});

// ============== POST READING (Main ESP32 Endpoint) ==============
app.post('/api/readings', (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📥 NEW READING RECEIVED FROM ESP32');
    console.log('========================================');
    
    const { 
      deviceId, 
      soilValue, 
      ldrValue, 
      soilCondition, 
      lightCondition,
      timestamp,
      wifiRSSI,
      freeHeap,
      sendAttempt
    } = req.body;
    
    // Validate required fields
    if (!deviceId) {
      console.error('❌ Missing deviceId');
      return res.status(400).json({
        success: false,
        error: 'Missing required field: deviceId'
      });
    }
    
    if (soilValue === undefined || ldrValue === undefined) {
      console.error('❌ Missing sensor values');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: soilValue and/or ldrValue'
      });
    }
    
    // Create reading object
    const reading = {
      id: `reading_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deviceId: deviceId,
      soilValue: parseInt(soilValue),
      ldrValue: parseInt(ldrValue),
      soilCondition: soilCondition || 'Unknown',
      lightCondition: lightCondition || 'Unknown',
      wifiRSSI: wifiRSSI || null,
      freeHeap: freeHeap || null,
      sendAttempt: sendAttempt || null,
      receivedAt: new Date().toISOString(),
      timestamp: timestamp || Date.now()
    };
    
    // Add to storage (newest first)
    readings.unshift(reading);
    
    // Trim old readings
    if (readings.length > MAX_READINGS) {
      readings = readings.slice(0, MAX_READINGS);
    }
    
    // Update device metadata
    if (!devices[deviceId]) {
      devices[deviceId] = {
        deviceId: deviceId,
        firstSeen: new Date().toISOString(),
        totalReadings: 0
      };
    }
    devices[deviceId].lastSeen = new Date().toISOString();
    devices[deviceId].totalReadings++;
    devices[deviceId].lastReading = reading;
    
    console.log('✅ Reading saved successfully!');
    console.log('Device:', deviceId);
    console.log('Soil:', soilValue, '→', soilCondition);
    console.log('Light:', ldrValue, '→', lightCondition);
    console.log('Total readings in memory:', readings.length);
    console.log('========================================\n');
    
    // Send success response
    res.status(201).json({
      success: true,
      message: 'Reading received and stored successfully',
      reading: reading,
      device: {
        deviceId: deviceId,
        totalReadings: devices[deviceId].totalReadings
      },
      stats: {
        totalReadings: readings.length,
        storageUsed: `${readings.length}/${MAX_READINGS}`
      }
    });
    
  } catch (error) {
    console.error('❌ ERROR processing reading:', error);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ============== GET ALL READINGS ==============
app.get('/api/readings', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const deviceId = req.query.deviceId;
    const skip = parseInt(req.query.skip) || 0;
    
    let filteredReadings = readings;
    
    // Filter by deviceId if provided
    if (deviceId) {
      filteredReadings = readings.filter(r => r.deviceId === deviceId);
    }
    
    // Apply pagination
    const paginatedReadings = filteredReadings.slice(skip, skip + limit);
    
    res.json({
      success: true,
      count: paginatedReadings.length,
      total: filteredReadings.length,
      skip: skip,
      limit: limit,
      readings: paginatedReadings
    });
    
  } catch (error) {
    console.error('Error fetching readings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== GET LATEST READING ==============
app.get('/api/readings/latest', (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    
    let latestReading;
    
    if (deviceId) {
      // Find latest reading for specific device
      latestReading = readings.find(r => r.deviceId === deviceId);
    } else {
      // Get overall latest reading
      latestReading = readings[0];
    }
    
    if (!latestReading) {
      return res.status(404).json({
        success: false,
        message: deviceId 
          ? `No readings found for device: ${deviceId}`
          : 'No readings available yet'
      });
    }
    
    res.json({
      success: true,
      reading: latestReading,
      device: devices[latestReading.deviceId]
    });
    
  } catch (error) {
    console.error('Error fetching latest reading:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== GET READINGS BY DEVICE ==============
app.get('/api/readings/:deviceId', (req, res) => {
  try {
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
      deviceId: deviceId,
      count: deviceReadings.length,
      device: devices[deviceId],
      readings: deviceReadings
    });
    
  } catch (error) {
    console.error('Error fetching device readings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== GET ALL DEVICES ==============
app.get('/api/devices', (req, res) => {
  try {
    res.json({
      success: true,
      count: Object.keys(devices).length,
      devices: Object.values(devices)
    });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== DELETE ALL READINGS (For Testing) ==============
app.delete('/api/readings', (req, res) => {
  try {
    const count = readings.length;
    readings = [];
    devices = {};
    
    console.log(`🗑️  Deleted ${count} readings and reset all devices`);
    
    res.json({
      success: true,
      message: `Deleted ${count} readings and reset device data`
    });
  } catch (error) {
    console.error('Error deleting readings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============== TEST ENDPOINT ==============
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working! 🎉',
    timestamp: new Date().toISOString(),
    testData: {
      sampleReading: {
        deviceId: 'ESP32_TEST',
        soilValue: 1500,
        ldrValue: 2500,
        soilCondition: 'Good',
        lightCondition: 'Good'
      }
    }
  });
});

// ============== ERROR HANDLERS ==============

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    message: 'The requested endpoint does not exist',
    availableEndpoints: [
      'GET /',
      'POST /api/readings',
      'GET /api/readings',
      'GET /api/readings/latest',
      'GET /api/readings/:deviceId',
      'GET /api/devices',
      'GET /api/test'
    ]
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  console.error('Stack:', err.stack);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// ============== START SERVER ==============

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🌱 PLANT MONITOR API SERVER');
  console.log('='.repeat(60));
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`\n📍 Local URL: http://localhost:${PORT}`);
  console.log(`📍 Health Check: http://localhost:${PORT}/`);
  console.log(`📍 Test Endpoint: http://localhost:${PORT}/api/test`);
  console.log('\n📋 Available Endpoints:');
  console.log('   GET  /                        - Health check & API info');
  console.log('   GET  /api/test                - Test endpoint');
  console.log('   POST /api/readings            - Submit sensor reading');
  console.log('   GET  /api/readings            - Get all readings');
  console.log('   GET  /api/readings/latest     - Get latest reading');
  console.log('   GET  /api/readings/:deviceId  - Get device readings');
  console.log('   GET  /api/devices             - Get all devices');
  console.log('='.repeat(60));
  console.log('✅ Server ready to receive data from ESP32!');
  console.log('💡 Waiting for sensor readings...\n');
});

// ============== GRACEFUL SHUTDOWN ==============

process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// ============== UNCAUGHT EXCEPTIONS ==============

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  console.error('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});
