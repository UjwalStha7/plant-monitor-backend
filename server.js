// ============================================================
// PLANT MONITOR BACKEND - MONGODB + SENDGRID EMAIL ALERTS
// ============================================================

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const app = express();

// ============== Configuration ==============
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://plantuser:ukdjs12345@plant-monitoring.vvaq3h6.mongodb.net/plant-monitor?retryWrites=true&w=majority';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
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

// ============== SendGrid Email Configuration ==============
let transporter;
const emailConfigured = SENDGRID_API_KEY && SENDGRID_API_KEY.startsWith('SG.');

if (emailConfigured) {
  try {
    transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey', // This is literal 'apikey', don't change
        pass: SENDGRID_API_KEY
      }
    });
    
    // Verify email configuration on startup
    transporter.verify()
      .then(() => {
        console.log('✅ SendGrid email service is ready!');
        console.log(`📧 Sending alerts to: ${ALERT_EMAIL}`);
      })
      .catch(error => {
        console.error('❌ SendGrid verification failed:', error.message);
        console.error('💡 Check your SENDGRID_API_KEY in Render environment variables');
        console.error('💡 Make sure sender email is verified in SendGrid dashboard');
      });
  } catch (error) {
    console.error('❌ Failed to create SendGrid transporter:', error.message);
  }
} else {
  console.warn('⚠️ Email alerts DISABLED');
  console.warn('💡 Set SENDGRID_API_KEY environment variable in Render');
  console.warn('💡 Get free API key: https://signup.sendgrid.com/');
}

// Track last alert time to prevent spam
let lastAlertTime = 0;
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes

// ✅ Check if it's night time (7 PM - 6 AM in Nepal Time UTC+5:45)
function isNightTime() {
  const now = new Date();
  const nepalOffset = 5.75 * 60 * 60 * 1000;
  const nepalTime = new Date(now.getTime() + nepalOffset);
  const hour = nepalTime.getUTCHours();
  return hour >= 19 || hour < 6;
}

async function sendAlert(reading) {
  if (!emailConfigured || !transporter) {
    console.log('⚠️ SendGrid not configured - skipping alert');
    console.log('💡 Set SENDGRID_API_KEY environment variable to enable alerts');
    return;
  }

  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN) {
    const waitTime = Math.ceil((ALERT_COOLDOWN - (now - lastAlertTime)) / 1000 / 60);
    console.log(`⏳ Alert cooldown active - wait ${waitTime} more minutes`);
    return;
  }

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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #ff6b6b; border-radius: 10px;">
        <h2 style="color: #ff6b6b;">⚠️ Plant Needs Attention!</h2>
        <p><strong>Alert Type:</strong> ${alertMessage}</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p><strong>Device:</strong> ${reading.deviceId}</p>
          <p><strong>Soil Condition:</strong> <span style="color: ${reading.soilCondition === 'Bad' ? '#ff6b6b' : '#51cf66'};">${reading.soilCondition}</span> (${reading.soilValue})</p>
          <p><strong>Light Condition:</strong> <span style="color: ${reading.lightCondition === 'Bad' ? '#ff6b6b' : '#51cf66'};">${reading.lightCondition}</span> (${reading.ldrValue})${isNight ? ' <em>(Night time - alert disabled)</em>' : ''}</p>
          <p><strong>Time:</strong> ${new Date(reading.receivedAt).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' })}</p>
        </div>
        <hr style="border: 1px solid #dee2e6;">
        <p style="color: #ff6b6b; font-weight: bold;"><em>🌱 Check your plant immediately!</em></p>
      </div>
    `;

    const mailOptions = {
      from: `"Plant Monitor 🌱" <${ALERT_EMAIL}>`,
      to: ALERT_EMAIL,
      subject,
      html
    };

    console.log('📧 Attempting to send email via SendGrid to:', ALERT_EMAIL);
    
    const info = await transporter.sendMail(mailOptions);
    
    lastAlertTime = now;
    console.log('✅ Alert email sent successfully via SendGrid!');
    console.log('📬 Message ID:', info.messageId);
    console.log('📝 Alert Type:', alertMessage);
    
  } catch (error) {
    console.error('❌ SendGrid email failed:', error.message);
    console.error('Full error:', error);
    
    if (error.message.includes('Unauthorized')) {
      console.error('💡 TIP: Check SENDGRID_API_KEY is correct');
    }
    if (error.message.includes('does not have permissions') || error.message.includes('sender')) {
      console.error('💡 TIP: Verify sender email in SendGrid dashboard');
      console.error('💡 URL: https://app.sendgrid.com/settings/sender_auth/senders');
    }
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
      version: '3.0.0-SENDGRID',
      timestamp: new Date().toISOString(),
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      emailService: 'SendGrid',
      emailConfigured: emailConfigured,
      emailStatus: emailConfigured ? '✅ SendGrid Configured' : '⚠️ Set SENDGRID_API_KEY',
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
    
    let deviceStatus = 'Disconnected';
    let timeSinceLastReading = null;
    
    if (latest) {
      timeSinceLastReading = Date.now() - new Date(latest.receivedAt).getTime();
      const threeMinutes = 3 * 60 * 1000;
      deviceStatus = timeSinceLastReading < threeMinutes ? 'Connected' : 'Disconnected';
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: readings.length,
      deviceStatus,
      timeSinceLastReading: timeSinceLastReading ? Math.floor(timeSinceLastReading / 1000) : null,
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

// ✅ Test email endpoint
app.get('/api/test-email', async (req, res) => {
  if (!emailConfigured || !transporter) {
    return res.json({ 
      success: false, 
      error: 'SendGrid not configured',
      steps: [
        '1. Sign up: https://signup.sendgrid.com/',
        '2. Create API Key: https://app.sendgrid.com/settings/api_keys',
        '3. Verify sender: https://app.sendgrid.com/settings/sender_auth/senders',
        '4. Add SENDGRID_API_KEY to Render environment variables'
      ]
    });
  }

  try {
    const testReading = {
      deviceId: 'TEST-DEVICE',
      soilValue: 100,
      ldrValue: 50,
      soilCondition: 'Bad',
      lightCondition: 'Bad',
      receivedAt: new Date()
    };

    // Temporarily bypass cooldown for testing
    const oldCooldown = lastAlertTime;
    lastAlertTime = 0;
    
    await sendAlert(testReading);
    
    // Restore cooldown
    lastAlertTime = oldCooldown;
    
    res.json({ 
      success: true, 
      message: '✅ Test email sent via SendGrid! Check your Gmail inbox.',
      sentTo: ALERT_EMAIL,
      note: 'Check spam folder if not in inbox',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.message,
      tip: 'Check Render logs for detailed error messages'
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API working! 🎉',
    emailService: 'SendGrid',
    isNightTime: isNightTime(),
    emailConfigured: emailConfigured,
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
    console.log('🌱 PLANT MONITOR API v3.0 (MongoDB + SendGrid Alerts)');
    console.log('='.repeat(60));
    console.log(`🚀 Running on port ${PORT}`);
    console.log(`📱 Frontend endpoint: GET /api/sensor-data`);
    console.log(`📥 ESP32 endpoint: POST /api/readings`);
    console.log(`🗄️  Database: MongoDB Atlas`);
    console.log(`📧 Email service: SendGrid ${emailConfigured ? '✅ Enabled' : '⚠️ Disabled'}`);
    console.log(`🌙 Night mode: ${isNightTime() ? 'Active' : 'Inactive'} (LDR alerts disabled 7PM-6AM)`);
    console.log('='.repeat(60));
  });
}