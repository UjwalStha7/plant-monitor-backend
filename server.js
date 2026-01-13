const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// Sensor Data Schema
const sensorDataSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  soilMoisture: {
    type: Number,
    required: true
  },
  soilCondition: {
    type: String,
    required: true,
    enum: ['Good', 'Okay', 'Bad']
  },
  lightLevel: {
    type: Number,
    required: true
  },
  lightCondition: {
    type: String,
    required: true,
    enum: ['Good', 'Okay', 'Bad']
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const SensorData = mongoose.model('SensorData', sensorDataSchema);

// Email Configuration (Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Alert Tracking (prevent spam)
let lastAlertTime = 0;
const ALERT_COOLDOWN = 10 * 60 * 1000; // 10 minutes

// Function to send email alert
async function sendEmailAlert(data) {
  const now = Date.now();
  
  // Check cooldown to prevent spam
  if (now - lastAlertTime < ALERT_COOLDOWN) {
    console.log('⏱️ Alert cooldown active, skipping email');
    return;
  }

  const alertReasons = [];
  if (data.soilCondition === 'Bad') {
    alertReasons.push(`🚨 Soil Moisture: ${data.soilMoisture} (Bad)`);
  }
  if (data.lightCondition === 'Bad') {
    alertReasons.push(`🚨 Light Level: ${data.lightLevel} (Bad)`);
  }

  if (alertReasons.length === 0) return;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: 'sthaujwal07@gmail.com',
    subject: '🚨 Plant Alert - Action Required!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">🌱 Plant Monitoring Alert</h2>
        <p style="font-size: 16px;">Your plant needs attention!</p>
        
        <div style="background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #c62828; margin-top: 0;">Alert Details:</h3>
          ${alertReasons.map(reason => `<p style="margin: 5px 0;">• ${reason}</p>`).join('')}
        </div>
        
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
          <h4 style="margin-top: 0;">Current Readings:</h4>
          <p><strong>Device ID:</strong> ${data.deviceId}</p>
          <p><strong>Soil Moisture:</strong> ${data.soilMoisture} - ${data.soilCondition}</p>
          <p><strong>Light Level:</strong> ${data.lightLevel} - ${data.lightCondition}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
        </div>
        
        <p style="margin-top: 20px; color: #666;">
          Please check your plant and take necessary action.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    lastAlertTime = now;
    console.log('✅ Alert email sent successfully');
  } catch (error) {
    console.error('❌ Email alert error:', error);
  }
}

// API Routes

// Health Check
app.get('/', (req, res) => {
  res.json({
    message: '🌱 Plant Monitor Backend API',
    status: 'running',
    endpoints: {
      health: 'GET /',
      postData: 'POST /api/sensor-data',
      latestData: 'GET /api/latest-data',
      history: 'GET /api/history'
    }
  });
});

// POST - Receive sensor data from ESP32
app.post('/api/sensor-data', async (req, res) => {
  try {
    const { deviceId, soilMoisture, soilCondition, lightLevel, lightCondition } = req.body;

    // Validation
    if (!deviceId || soilMoisture === undefined || !soilCondition || 
        lightLevel === undefined || !lightCondition) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate condition values
    const validConditions = ['Good', 'Okay', 'Bad'];
    if (!validConditions.includes(soilCondition) || !validConditions.includes(lightCondition)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid condition values. Must be: Good, Okay, or Bad'
      });
    }

    // Save to database
    const sensorData = new SensorData({
      deviceId,
      soilMoisture: Number(soilMoisture),
      soilCondition,
      lightLevel: Number(lightLevel),
      lightCondition,
      timestamp: new Date()
    });

    await sensorData.save();
    console.log('✅ Data saved:', sensorData);

    // Check for bad conditions and send alert
    if (soilCondition === 'Bad' || lightCondition === 'Bad') {
      console.log('⚠️ Bad condition detected, sending alert...');
      sendEmailAlert(sensorData); // Non-blocking
    }

    res.status(201).json({
      success: true,
      message: 'Sensor data received successfully',
      data: sensorData
    });

  } catch (error) {
    console.error('❌ Error saving sensor data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// GET - Latest sensor data
app.get('/api/latest-data', async (req, res) => {
  try {
    const { deviceId } = req.query;
    
    const query = deviceId ? { deviceId } : {};
    const latestData = await SensorData.findOne(query)
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
    console.error('❌ Error fetching latest data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// GET - Historical data
app.get('/api/history', async (req, res) => {
  try {
    const { deviceId, limit = 50, hours = 24 } = req.query;
    
    const timeLimit = new Date(Date.now() - (hours * 60 * 60 * 1000));
    const query = {
      timestamp: { $gte: timeLimit }
    };
    
    if (deviceId) {
      query.deviceId = deviceId;
    }

    const history = await SensorData.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    console.error('❌ Error fetching history:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// GET - Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const { deviceId } = req.query;
    const query = deviceId ? { deviceId } : {};

    const totalReadings = await SensorData.countDocuments(query);
    const goodConditions = await SensorData.countDocuments({
      ...query,
      soilCondition: 'Good',
      lightCondition: 'Good'
    });
    const badConditions = await SensorData.countDocuments({
      ...query,
      $or: [
        { soilCondition: 'Bad' },
        { lightCondition: 'Bad' }
      ]
    });

    res.json({
      success: true,
      stats: {
        totalReadings,
        goodConditions,
        badConditions,
        healthScore: totalReadings > 0 
          ? Math.round((goodConditions / totalReadings) * 100) 
          : 0
      }
    });

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Ready to receive data from ESP32`);
});
