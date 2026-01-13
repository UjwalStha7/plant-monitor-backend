// server.js - Main Backend Server
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// ============== SCHEMAS ==============

// Sensor Data Schema
const sensorDataSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    default: 'ESP32_001'
  },
  soilValue: {
    type: Number,
    required: true
  },
  ldrValue: {
    type: Number,
    required: true
  },
  soilCondition: {
    type: String,
    enum: ['Good', 'Okay', 'Bad'],
    required: true
  },
  lightCondition: {
    type: String,
    enum: ['Good', 'Okay', 'Bad'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const SensorData = mongoose.model('SensorData', sensorDataSchema);

// Device Status Schema
const deviceStatusSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
});

const DeviceStatus = mongoose.model('DeviceStatus', deviceStatusSchema);

// ============== EMAIL CONFIGURATION ==============

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // Use App Password, not regular password
  }
});

// Email tracking to avoid spam
let lastEmailSent = {
  soil: 0,
  light: 0
};

const EMAIL_COOLDOWN = 5 * 60 * 1000; // 5 minutes between same alert type

async function sendAlert(type, value, condition) {
  const now = Date.now();
  
  // Check cooldown
  if (now - lastEmailSent[type] < EMAIL_COOLDOWN) {
    console.log(`⏳ Email cooldown active for ${type}`);
    return;
  }

  const subject = type === 'soil' 
    ? '🚨 Alert: Low Soil Moisture Detected!' 
    : '🚨 Alert: Poor Light Condition Detected!';
  
  const message = type === 'soil'
    ? `⚠️ Your plant needs water!\n\nSoil Moisture Value: ${value}\nCondition: ${condition}\n\nPlease water your plant soon.`
    : `⚠️ Your plant needs more light!\n\nLight Value: ${value}\nCondition: ${condition}\n\nPlease move your plant to a brighter location.`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: 'sthaujwal07@gmail.com',
    subject: subject,
    text: message
  };

  try {
    await transporter.sendMail(mailOptions);
    lastEmailSent[type] = now;
    console.log(`✅ ${type} alert email sent successfully`);
  } catch (error) {
    console.error(`❌ Email error:`, error);
  }
}

// ============== API ROUTES ==============

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend is running',
    timestamp: new Date().toISOString()
  });
});

// POST - Receive sensor data from ESP32
app.post('/api/sensor-data', async (req, res) => {
  try {
    const { deviceId, soilValue, ldrValue, soilCondition, lightCondition } = req.body;

    // Validate required fields
    if (!soilValue || !ldrValue || !soilCondition || !lightCondition) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // Save sensor data
    const sensorData = new SensorData({
      deviceId: deviceId || 'ESP32_001',
      soilValue,
      ldrValue,
      soilCondition,
      lightCondition
    });

    await sensorData.save();

    // Update device status
    await DeviceStatus.findOneAndUpdate(
      { deviceId: deviceId || 'ESP32_001' },
      { 
        status: 'online',
        lastSeen: new Date()
      },
      { upsert: true, new: true }
    );

    // Check for alerts
    if (soilCondition === 'Bad') {
      await sendAlert('soil', soilValue, soilCondition);
    }
    
    if (lightCondition === 'Bad') {
      await sendAlert('light', ldrValue, lightCondition);
    }

    res.json({ 
      success: true, 
      message: 'Data received successfully',
      data: sensorData
    });

  } catch (error) {
    console.error('Error saving sensor data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message
    });
  }
});

// GET - Latest sensor reading
app.get('/api/sensor-data/latest', async (req, res) => {
  try {
    const latestData = await SensorData.findOne()
      .sort({ timestamp: -1 })
      .limit(1);

    if (!latestData) {
      return res.status(404).json({ 
        success: false, 
        message: 'No data found' 
      });
    }

    res.json({ 
      success: true, 
      data: latestData 
    });

  } catch (error) {
    console.error('Error fetching latest data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// GET - Historical data (last 24 hours)
app.get('/api/sensor-data/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const hours = parseInt(req.query.hours) || 24;
    
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    const historicalData = await SensorData.find({
      timestamp: { $gte: startTime }
    })
    .sort({ timestamp: -1 })
    .limit(limit);

    res.json({ 
      success: true, 
      count: historicalData.length,
      data: historicalData 
    });

  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// GET - Device status
app.get('/api/device/status', async (req, res) => {
  try {
    const deviceId = req.query.deviceId || 'ESP32_001';
    let device = await DeviceStatus.findOne({ deviceId });

    if (!device) {
      device = await DeviceStatus.create({ 
        deviceId, 
        status: 'offline' 
      });
    }

    // Check if device is offline (no data for 30 seconds)
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    if (device.lastSeen < thirtySecondsAgo && device.status === 'online') {
      device.status = 'offline';
      await device.save();
    }

    res.json({ 
      success: true, 
      data: {
        deviceId: device.deviceId,
        status: device.status,
        lastSeen: device.lastSeen
      }
    });

  } catch (error) {
    console.error('Error fetching device status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// GET - Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalReadings = await SensorData.countDocuments();
    const latestData = await SensorData.findOne().sort({ timestamp: -1 });
    const device = await DeviceStatus.findOne({ deviceId: 'ESP32_001' });

    res.json({
      success: true,
      data: {
        totalReadings,
        latestReading: latestData,
        deviceStatus: device ? device.status : 'offline',
        lastSeen: device ? device.lastSeen : null
      }
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// ============== BACKGROUND TASKS ==============

// Check device status every 30 seconds
setInterval(async () => {
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    
    await DeviceStatus.updateMany(
      { 
        lastSeen: { $lt: thirtySecondsAgo },
        status: 'online'
      },
      { 
        status: 'offline' 
      }
    );
  } catch (error) {
    console.error('Error updating device status:', error);
  }
}, 30000);

// ============== START SERVER ==============

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Backend URL: http://localhost:${PORT}`);
});