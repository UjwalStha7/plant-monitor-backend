// server.ts
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'your_mongodb_uri_here';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// MongoDB Schema
const SensorDataSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  soilValue: { type: Number, required: true },
  ldrValue: { type: Number, required: true },
  soilStatus: { type: String, required: true },
  lightStatus: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const SensorData = mongoose.model('SensorData', SensorDataSchema);

// Email Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail
    pass: process.env.EMAIL_PASS  // Your Gmail App Password
  }
});

// Track last alert sent (to avoid spam)
let lastAlertSent = {
  soil: 0,
  light: 0
};

const ALERT_COOLDOWN = 10 * 60 * 1000; // 10 minutes

// Function to send email alert
async function sendEmailAlert(type: string, value: number, status: string) {
  const now = Date.now();
  
  // Check cooldown
  if (type === 'soil' && now - lastAlertSent.soil < ALERT_COOLDOWN) return;
  if (type === 'light' && now - lastAlertSent.light < ALERT_COOLDOWN) return;

  const subject = `⚠️ Plant Alert: ${type === 'soil' ? 'Soil Moisture Low' : 'Light Insufficient'}`;
  const text = `
    🌱 Plant Monitoring System Alert
    
    Alert Type: ${type === 'soil' ? 'Soil Moisture' : 'Light Level'}
    Status: ${status}
    Current Value: ${value}
    Timestamp: ${new Date().toLocaleString()}
    
    Please check your plant immediately!
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: 'sthaujwal07@gmail.com',
      subject: subject,
      text: text
    });

    // Update last alert time
    if (type === 'soil') lastAlertSent.soil = now;
    if (type === 'light') lastAlertSent.light = now;

    console.log(`📧 Email alert sent for ${type}`);
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
}

// Routes

// POST /api/data - Receive data from ESP32
app.post('/api/data', async (req: Request, res: Response) => {
  try {
    const { deviceId, soilValue, ldrValue, soilStatus, lightStatus } = req.body;

    // Validate data
    if (!deviceId || soilValue === undefined || ldrValue === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Save to database
    const newData = new SensorData({
      deviceId,
      soilValue,
      ldrValue,
      soilStatus,
      lightStatus
    });

    await newData.save();

    // Check for alerts
    if (soilStatus === 'Bad') {
      await sendEmailAlert('soil', soilValue, soilStatus);
    }
    if (lightStatus === 'Bad') {
      await sendEmailAlert('light', ldrValue, lightStatus);
    }

    res.status(201).json({ 
      message: 'Data received successfully',
      data: newData 
    });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/latest - Get latest sensor data
app.get('/api/latest', async (req: Request, res: Response) => {
  try {
    const latestData = await SensorData.findOne().sort({ timestamp: -1 });
    
    if (!latestData) {
      return res.status(404).json({ error: 'No data found' });
    }

    res.json(latestData);
  } catch (error) {
    console.error('Error fetching latest data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/status - Check ESP32 connection status
app.get('/api/status', async (req: Request, res: Response) => {
  try {
    const latestData = await SensorData.findOne().sort({ timestamp: -1 });
    
    if (!latestData) {
      return res.json({ status: 'disconnected' });
    }

    const now = Date.now();
    const lastUpdate = new Date(latestData.timestamp).getTime();
    const timeDifference = now - lastUpdate;

    // Consider connected if last update was within 10 seconds
    const isConnected = timeDifference < 10000;

    res.json({ 
      status: isConnected ? 'connected' : 'disconnected',
      lastUpdate: latestData.timestamp
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/history - Get historical data for graphs
app.get('/api/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    
    const history = await SensorData
      .find()
      .sort({ timestamp: -1 })
      .limit(limit);

    // Reverse to show oldest first for graphs
    res.json(history.reverse());
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;