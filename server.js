// ============================================================
// PLANT MONITOR BACKEND - MONGODB + EMAIL ALERTS
// ============================================================

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const app = express();

// ============== Configuration ==============
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://plantuser:ukdjs12345@plant-monitoring.vvaq3h6.mongodb.net/plant-monitor?retryWrites=true&w=majority';
const EMAIL_USER = process.env.EMAIL_USER; // Add to Render env vars
const EMAIL_PASS = process.env.EMAIL_PASS; // Add to Render env vars
const ALERT_EMAIL = 'sthaujwal07@gmail.com';

// ============== MongoDB Connection ==============
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

// ============== Mongoose Schema ==============
const readingSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  soilValue: { type: Number, required: true },
  ldrValue: { type: Number, required: true },
  soilCondition: { type: String, required: true },
  lightCondition: { type: String, required: true },
  wifiRSSI: Number,
  freeHeap: Number,
  sendAttempt: Number,
  receivedAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

const Reading = mongoose.model('Reading', readingSchema);

// ============== Email Configuration ==============
let transporter;
if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS // Use App Password for Gmail
    }
  });
}

// Track last alert time to prevent spam
let lastAlertTime = 0;
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes

async function sendAlert(reading) {
  if (!transporter) {
    console.log('⚠️ Email not configured');
    return;
  }

  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN) {
    console.log('⏳ Alert cooldown active');
    return;
  }

  try {
    const subject = '🚨 Plant Monitor Alert';
    const html = `
      <h2>⚠️ Plant Needs Attention!</h2>
      <p><strong>Device:</strong> ${reading.deviceId}</p>
      <p><strong>Soil Condition:</strong> ${reading.soilCondition} (${reading.soilValue})</p>
      <p><strong>Light Condition:</strong> ${reading.lightCondition} (${reading.ldrValue})</p>
      <p><strong>Time:</strong> ${new Date(reading.receivedAt).toLocaleString()}</p>
      <hr>
      <p><em>Check your plant immediately!</em></p>
    `;

    await transporter.sendMail({
      from: EMAIL_USER,
      to: ALERT_EMAIL,
      subject,
      html
    });

    lastAlertTime = now;
    console.log('📧 Alert email sent!');
  } catch (error) {
    console.error('❌ Email error:', error.message);
  }
}

// ============== Middleware ==============
app.use(cors({
  origin: [
    'https://plant-monitor-frontend-mu.vercel.app',
    'https://plant-monitor-frontend-chi.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));

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

// ============== ROUTES ==============

// Health Check
app.get('/', async (req, res) => {
  try {
    const totalReadings = await Reading.countDocuments();
    const latestReading = await Reading.findOne().sort({ receivedAt: -1 });
    
    res.json({
      status: 'online',
      message: '🌱 Plant Monitor API is running!',
      version: '3.0.0-MONGODB',
      timestamp: new Date().toISOString(),
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      statistics: {
        totalReadings,
        latestReading: latestReading?.receivedAt || null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ ESP32 POST endpoint
app.post('/api/readings', async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📥 NEW READING FROM ESP32');
    console.log('========================================');
    
    const { 
      deviceId, soilValue, ldrValue, soilCondition, lightCondition,
      wifiRSSI, freeHeap, sendAttempt
    } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Missing deviceId' });
    }
    
    // Create and save reading to MongoDB
    const reading = new Reading({
      deviceId,
      soilValue: parseInt(soilValue),
      ldrValue: parseInt(ldrValue),
      soilCondition: soilCondition || 'Unknown',
      lightCondition: lightCondition || 'Unknown',
      wifiRSSI: wifiRSSI ? parseInt(wifiRSSI) : null,
      freeHeap: freeHeap ? parseInt(freeHeap) : null,
      sendAttempt: sendAttempt ? parseInt(sendAttempt) : null,
      receivedAt: new Date()
    });
    
    await reading.save();
    
    console.log('✅ SAVED TO MONGODB:', deviceId, 'Soil:', soilValue, 'Light:', ldrValue);
    
    // Check if alert needed
    if (soilCondition === 'Bad' || lightCondition === 'Bad') {
      console.log('⚠️ Bad condition detected, sending alert...');
      await sendAlert(reading);
    }
    
    const totalReadings = await Reading.countDocuments();
    
    res.status(201).json({
      success: true,
      message: 'Data saved to database!',
      reading,
      stats: { totalReadings }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ FRONTEND GET endpoint
app.get('/api/sensor-data', async (req, res) => {
  try {
    console.log('📱 Frontend requesting sensor data');
    const limit = parseInt(req.query.limit) || 50;
    const deviceId = req.query.deviceId;
    
    // Build query
    const query = deviceId ? { deviceId } : {};
    
    // Get readings from MongoDB (newest first)
    const readings = await Reading.find(query)
      .sort({ receivedAt: -1 })
      .limit(limit);
    
    // Get latest reading
    const latest = readings[0];
    
    // Calculate device status (connected if data within 2 minutes)
    let deviceStatus = 'Disconnected';
    if (latest) {
      const timeSinceLastReading = Date.now() - new Date(latest.receivedAt).getTime();
      const twoMinutes = 2 * 60 * 1000;
      deviceStatus = timeSinceLastReading < twoMinutes ? 'Connected' : 'Disconnected';
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: readings.length,
      deviceStatus, // ← Frontend can use this
      latest: latest ? {
        soilValue: latest.soilValue,
        ldrValue: latest.ldrValue,
        soilCondition: latest.soilCondition,
        lightCondition: latest.lightCondition,
        timestamp: latest.receivedAt,
        deviceId: latest.deviceId,
        lastUpdated: latest.updatedAt || latest.receivedAt // ← For "Last updated" UI
      } : null,
      data: readings.map(r => ({
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

// Latest reading only
app.get('/api/readings/latest', async (req, res) => {
  try {
    const deviceId = req.query.deviceId;
    const query = deviceId ? { deviceId } : {};
    
    const latest = await Reading.findOne(query).sort({ receivedAt: -1 });
    
    if (!latest) {
      return res.status(404).json({ success: false, message: 'No data yet' });
    }
    
    // Calculate device status
    const timeSinceLastReading = Date.now() - new Date(latest.receivedAt).getTime();
    const twoMinutes = 2 * 60 * 1000;
    const deviceStatus = timeSinceLastReading < twoMinutes ? 'Connected' : 'Disconnected';
    
    res.json({ 
      success: true, 
      reading: latest,
      deviceStatus,
      lastUpdated: latest.updatedAt || latest.receivedAt
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete old readings (cleanup endpoint)
app.delete('/api/readings/cleanup', async (req, res) => {
  try {
    const daysToKeep = parseInt(req.query.days) || 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await Reading.deleteMany({ receivedAt: { $lt: cutoffDate } });
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} readings older than ${daysToKeep} days`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API working! 🎉' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: err.message });
});

// Vercel export
module.exports = app;

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🌱 PLANT MONITOR API v3.0 (MongoDB + Alerts)');
    console.log('='.repeat(60));
    console.log(`🚀 Running on port ${PORT}`);
    console.log(`📱 Frontend endpoint: GET /api/sensor-data`);
    console.log(`📥 ESP32 endpoint: POST /api/readings`);
    console.log(`🗄️  Database: MongoDB Atlas`);
    console.log('='.repeat(60));
  });
}