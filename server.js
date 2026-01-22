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
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
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
  timestamps: true
});

const Reading = mongoose.model('Reading', readingSchema);

// ============== Email Configuration ==============
let transporter;
if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
}

// Track last alert time to prevent spam
let lastAlertTime = 0;
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes

// ✅ NEW: Check if it's night time (7 PM - 6 AM in Nepal Time UTC+5:45)
function isNightTime() {
  const now = new Date();
  // Convert to Nepal Time (UTC+5:45)
  const nepalOffset = 5.75 * 60 * 60 * 1000; // 5 hours 45 minutes in milliseconds
  const nepalTime = new Date(now.getTime() + nepalOffset);
  const hour = nepalTime.getUTCHours();
  
  // Night time: 19:00 (7 PM) to 06:00 (6 AM)
  return hour >= 19 || hour < 6;
}

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

  // ✅ NEW: Don't send LDR alerts at night, but ALWAYS send soil alerts
  const isNight = isNightTime();
  const shouldSendLDRAlert = reading.lightCondition === 'Bad' && !isNight;
  const shouldSendSoilAlert = reading.soilCondition === 'Bad';

  if (!shouldSendLDRAlert && !shouldSendSoilAlert) {
    console.log(`🌙 Night time (${isNight ? 'Yes' : 'No'}), skipping LDR alert`);
    return;
  }

  try {
    let alertMessage = '';
    if (shouldSendSoilAlert && shouldSendLDRAlert) {
      alertMessage = 'Both Soil & Light need attention!';
    } else if (shouldSendSoilAlert) {
      alertMessage = 'Soil needs attention!';
    } else {
      alertMessage = 'Light condition needs attention!';
    }

    const subject = `🚨 Plant Monitor Alert - ${alertMessage}`;
    const html = `
      <h2>⚠️ Plant Needs Attention!</h2>
      <p><strong>Alert Type:</strong> ${alertMessage}</p>
      <p><strong>Device:</strong> ${reading.deviceId}</p>
      <p><strong>Soil Condition:</strong> ${reading.soilCondition} (${reading.soilValue})</p>
      <p><strong>Light Condition:</strong> ${reading.lightCondition} (${reading.ldrValue})${isNight ? ' <em>(Night time - alert disabled)</em>' : ''}</p>
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
    console.log('📧 Alert email sent!', alertMessage);
  } catch (error) {
    console.error('❌ Email error:', error.message);
  }
}

// ============== Middleware ==============
app.use(cors({
  origin: [
    'https://plant-monitor-frontend-mu.vercel.app',
    'https://plant-monitor-frontend-chi.vercel.app',
    /\.vercel\.app$/,
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8081'
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
      isNightTime: isNightTime(),
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
      console.log('⚠️ Bad condition detected, checking alert rules...');
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

// ✅ FRONTEND GET endpoint - Enhanced with real-time status
app.get('/api/sensor-data', async (req, res) => {
  try {
    console.log('📱 Frontend requesting sensor data');
    const limit = parseInt(req.query.limit) || 50;
    const deviceId = req.query.deviceId;
    
    const query = deviceId ? { deviceId } : {};
    
    const readings = await Reading.find(query)
      .sort({ receivedAt: -1 })
      .limit(limit);
    
    const latest = readings[0];
    
    // Calculate device status - ESP32 sends data every 1 minute
    // Consider disconnected if no data for 3 minutes (to account for delays)
    let deviceStatus = 'Disconnected';
    let timeSinceLastReading = null;
    
    if (latest) {
      timeSinceLastReading = Date.now() - new Date(latest.receivedAt).getTime();
      const threeMinutes = 3 * 60 * 1000; // 3 minutes threshold
      deviceStatus = timeSinceLastReading < threeMinutes ? 'Connected' : 'Disconnected';
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: readings.length,
      deviceStatus,
      timeSinceLastReading: timeSinceLastReading ? Math.floor(timeSinceLastReading / 1000) : null, // in seconds
      latest: latest ? {
        soilValue: latest.soilValue,
        ldrValue: latest.ldrValue,
        soilCondition: latest.soilCondition,
        lightCondition: latest.lightCondition,
        timestamp: latest.receivedAt,
        deviceId: latest.deviceId,
        wifiRSSI: latest.wifiRSSI,
        lastUpdated: latest.updatedAt || latest.receivedAt
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
    
    const timeSinceLastReading = Date.now() - new Date(latest.receivedAt).getTime();
    const threeMinutes = 3 * 60 * 1000;
    const deviceStatus = timeSinceLastReading < threeMinutes ? 'Connected' : 'Disconnected';
    
    res.json({ 
      success: true, 
      reading: latest,
      deviceStatus,
      timeSinceLastReading: Math.floor(timeSinceLastReading / 1000),
      lastUpdated: latest.updatedAt || latest.receivedAt
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete old readings
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
  res.json({ 
    success: true, 
    message: 'API working! 🎉',
    isNightTime: isNightTime(),
    timestamp: new Date().toISOString()
  });
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
    console.log('🌱 PLANT MONITOR API v3.0 (MongoDB + Smart Alerts)');
    console.log('='.repeat(60));
    console.log(`🚀 Running on port ${PORT}`);
    console.log(`📱 Frontend endpoint: GET /api/sensor-data`);
    console.log(`📥 ESP32 endpoint: POST /api/readings`);
    console.log(`🗄️  Database: MongoDB Atlas`);
    console.log(`🌙 Night mode: ${isNightTime() ? 'Active' : 'Inactive'} (LDR alerts disabled 7PM-6AM)`);
    console.log('='.repeat(60));
  });
}