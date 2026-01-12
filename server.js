const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// ============== MIDDLEWARE ==============
app.use(cors());
app.use(express.json());

// ============== MONGODB CONNECTION ==============
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Atlas Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

// ============== SENSOR DATA SCHEMA ==============
const sensorSchema = new mongoose.Schema({
  soilValue: {
    type: Number,
    required: true
  },
  soilCondition: {
    type: String,
    enum: ['Good', 'Okay', 'Bad'],
    required: true
  },
  ldrValue: {
    type: Number,
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
  },
  alertSent: {
    type: Boolean,
    default: false
  }
});

const SensorData = mongoose.model('SensorData', sensorSchema);

// ============== EMAIL CONFIGURATION ==============
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // App Password, not regular password
  }
});

// ============== ALERT FUNCTION ==============
async function sendAlert(data) {
  // Only send alert if soil is Bad OR light is Bad
  if (data.soilCondition === 'Bad' || data.lightCondition === 'Bad') {
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'sthaujwal07@gmail.com',
      subject: '🚨 Plant Alert - Immediate Attention Required',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <h2 style="color: #d32f2f;">🌱 Plant Monitoring Alert</h2>
            <p style="font-size: 16px; color: #333;">Your plant needs attention!</p>
            
            <div style="background-color: #fff3e0; padding: 15px; border-left: 4px solid #ff9800; margin: 20px 0;">
              <h3 style="color: #e65100; margin-top: 0;">📊 Current Readings:</h3>
              
              <p style="margin: 10px 0;">
                <strong>Soil Moisture:</strong> ${data.soilValue} 
                <span style="color: ${data.soilCondition === 'Bad' ? '#d32f2f' : data.soilCondition === 'Okay' ? '#f57c00' : '#388e3c'}; 
                      font-weight: bold; padding: 3px 8px; border-radius: 3px; background-color: ${data.soilCondition === 'Bad' ? '#ffebee' : data.soilCondition === 'Okay' ? '#fff3e0' : '#e8f5e9'};">
                  ${data.soilCondition}
                </span>
              </p>
              
              <p style="margin: 10px 0;">
                <strong>Light Level:</strong> ${data.ldrValue} 
                <span style="color: ${data.lightCondition === 'Bad' ? '#d32f2f' : data.lightCondition === 'Okay' ? '#f57c00' : '#388e3c'}; 
                      font-weight: bold; padding: 3px 8px; border-radius: 3px; background-color: ${data.lightCondition === 'Bad' ? '#ffebee' : data.lightCondition === 'Okay' ? '#fff3e0' : '#e8f5e9'};">
                  ${data.lightCondition}
                </span>
              </p>
            </div>
            
            <div style="background-color: #ffebee; padding: 15px; border-left: 4px solid #d32f2f; margin: 20px 0;">
              <h3 style="color: #d32f2f; margin-top: 0;">⚠️ Issues Detected:</h3>
              ${data.soilCondition === 'Bad' ? '<p>❌ <strong>Soil is too dry!</strong> Please water your plant immediately.</p>' : ''}
              ${data.lightCondition === 'Bad' ? '<p>❌ <strong>Insufficient light!</strong> Move plant to a brighter location.</p>' : ''}
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              <em>Alert sent at: ${new Date().toLocaleString()}</em>
            </p>
          </div>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log('✅ Alert email sent successfully');
      return true;
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      return false;
    }
  }
  return false;
}

// ============== API ENDPOINTS ==============

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: 'Plant Monitoring Backend is running',
    timestamp: new Date().toISOString()
  });
});

// POST: Receive sensor data from ESP32
app.post('/api/sensor-data', async (req, res) => {
  try {
    const { soilValue, soilCondition, ldrValue, lightCondition } = req.body;

    // Validation
    if (!soilValue || !soilCondition || !ldrValue || !lightCondition) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields' 
      });
    }

    // Validate condition values
    if (!['Good', 'Okay', 'Bad'].includes(soilCondition) || 
        !['Good', 'Okay', 'Bad'].includes(lightCondition)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid condition values' 
      });
    }

    // Save to database
    const sensorData = new SensorData({
      soilValue: parseInt(soilValue),
      soilCondition,
      ldrValue: parseInt(ldrValue),
      lightCondition
    });

    await sensorData.save();
    console.log('📊 Sensor data saved:', sensorData);

    // Send alert if needed
    const alertSent = await sendAlert(sensorData);
    
    if (alertSent) {
      sensorData.alertSent = true;
      await sensorData.save();
    }

    res.status(201).json({ 
      success: true,
      message: 'Data received successfully',
      alertSent,
      data: sensorData
    });

  } catch (error) {
    console.error('Error saving sensor data:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// GET: Latest sensor data for frontend
app.get('/api/latest-data', async (req, res) => {
  try {
    const latestData = await SensorData.findOne()
      .sort({ timestamp: -1 })
      .limit(1);

    if (!latestData) {
      return res.status(404).json({ 
        success: false,
        message: 'No data available yet' 
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
      error: 'Internal server error' 
    });
  }
});

// GET: Historical data (optional - for charts)
app.get('/api/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const hours = parseInt(req.query.hours) || 24;

    const timeAgo = new Date(Date.now() - hours * 60 * 60 * 1000);

    const history = await SensorData.find({
      timestamp: { $gte: timeAgo }
    })
    .sort({ timestamp: -1 })
    .limit(limit);

    res.json({ 
      success: true,
      count: history.length,
      data: history 
    });

  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// GET: Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const total = await SensorData.countDocuments();
    const alertsCount = await SensorData.countDocuments({ alertSent: true });
    const latest = await SensorData.findOne().sort({ timestamp: -1 });

    res.json({
      success: true,
      stats: {
        totalReadings: total,
        totalAlerts: alertsCount,
        lastUpdate: latest ? latest.timestamp : null,
        currentStatus: latest ? {
          soil: latest.soilCondition,
          light: latest.lightCondition
        } : null
      }
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// ============== START SERVER ==============
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Ready to receive ESP32 data`);
});