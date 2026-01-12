🌱 IoT Plant Monitoring System
Academic Project - Real-time plant health monitoring using ESP32, Node.js backend, and React frontend

📌 Project Overview
An IoT-based plant monitoring system that measures soil moisture and light levels using ESP32 sensors, stores data in the cloud, displays real-time information on a web dashboard, and sends email alerts when plant conditions are critical.

Team: UK DJ's
College Project

🎯 Features
✅ Real-time soil moisture monitoring
✅ Real-time light level monitoring
✅ OLED display on ESP32 device
✅ Cloud-based data storage
✅ Web dashboard for monitoring
✅ Email alerts for critical conditions
✅ Historical data tracking
✅ 100% free deployment
🏗️ System Architecture
┌─────────────┐
│   ESP32     │  → Reads sensors every 10 seconds
│  (Hardware) │     Displays on OLED
└──────┬──────┘
       │
       │ HTTP POST (WiFi)
       ↓
┌─────────────────────┐
│  Backend (Render)   │  → Validates & stores data
│  Node.js + Express  │     Triggers email alerts
└──────┬──────────────┘
       │
       ├→ MongoDB Atlas (Database)
       ├→ Gmail SMTP (Email alerts)
       │
       ↓
┌──────────────────┐
│ Frontend (Vercel)│  → Real-time dashboard
│   React + Vite   │     Charts & statistics
└──────────────────┘
🛠️ Tech Stack
Hardware
ESP32 (DevKit)
Soil Moisture Sensor (Capacitive)
LDR Sensor (Light Dependent Resistor)
OLED Display (128x64 SSD1306)
LEDs (Red, Green, Yellow)
Buzzer
Backend
Runtime: Node.js
Framework: Express.js
Database: MongoDB Atlas (Free M0)
Email: Nodemailer + Gmail SMTP
Hosting: Render (Free Tier)
Frontend
Framework: React
Build Tool: Vite
Hosting: Vercel (Free)
UI Library: (Your existing Lovable frontend)
📊 Sensor Logic
Soil Moisture Thresholds:
Range	Condition	Action
≤ 1500	Good ✅	Green LED ON
1501-2500	Okay ⚠️	Yellow LED ON
> 2500	Bad ❌	Buzzer ON + Email Alert
Light (LDR) Thresholds:
Range	Condition	Action
≥ 3000	Good ✅	No action
1500-2999	Okay ⚠️	No action
< 1500	Bad ❌	Red LED ON + Email Alert
🚀 Quick Start
Prerequisites
Node.js (v18+)
Arduino IDE with ESP32 support
MongoDB Atlas account (free)
Gmail account with App Password
GitHub account
Render account (free)
Vercel account (free)
1. Clone Repository
bash
git clone <your-backend-repo>
cd plant-monitoring-backend
npm install
2. Environment Setup
Create .env file:

env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/plantMonitoring
PORT=3000
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
3. Run Locally
bash
npm start
Backend runs on http://localhost:3000

4. Deploy Backend (Render)
Push code to GitHub
Connect GitHub to Render
Add environment variables
Deploy (auto-deploys on git push)
5. Deploy Frontend (Vercel)
bash
cd plantmonitor
vercel deploy
6. Upload ESP32 Code
Open ESP32_PlantMonitor_WiFi.ino
Update WiFi credentials and backend URL
Upload to ESP32
📡 API Endpoints
Method	Endpoint	Description
GET	/	Health check
POST	/api/sensor-data	Receive sensor data from ESP32
GET	/api/latest-data	Get latest sensor reading
GET	/api/history	Get historical data
GET	/api/stats	Get system statistics
Full API docs: See API_DOCUMENTATION.md

📧 Email Alert System
Triggers:

Soil condition = "Bad" (soil too dry)
Light condition = "Bad" (insufficient light)
Alert Email Contains:

Current sensor values
Color-coded status indicators
Specific recommended actions
Timestamp
Recipient: sthaujwal07@gmail.com

🔧 Hardware Wiring
ESP32 Pin Configuration:
Soil Moisture Sensor → GPIO 32 (ADC1_CH4)
LDR Sensor          → GPIO 33 (ADC1_CH5)
OLED SDA            → GPIO 21
OLED SCL            → GPIO 22
Green LED           → GPIO 5
Yellow LED          → GPIO 18
Red LED             → GPIO 2
Buzzer              → GPIO 19
📂 Project Structure
plant-monitoring-backend/
├── server.js              # Main backend server
├── package.json          # Dependencies
├── .env.example          # Environment template
├── README.md             # This file
├── API_DOCUMENTATION.md  # API reference
└── DEPLOYMENT_STEPS.md   # Deployment guide

ESP32/
└── ESP32_PlantMonitor_WiFi.ino  # Arduino code

Frontend/
└── (Your Lovable frontend from GitHub)
🎓 Academic Information
Purpose: College IoT Project
Focus Areas:

IoT sensor integration
Cloud computing
RESTful API design
Real-time data visualization
Email notification system
Learning Outcomes:

ESP32 programming
Backend development (Node.js)
Database management (MongoDB)
API integration
Cloud deployment
🐛 Troubleshooting
ESP32 Not Connecting to WiFi
Check WiFi credentials (case-sensitive)
Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
Verify WiFi password
Backend Not Receiving Data
Check Render app status (may be sleeping)
Verify backend URL in ESP32 code
Check Serial Monitor for error messages
Email Not Sending
Use Gmail App Password (not regular password)
Enable 2FA on Gmail account
Verify EMAIL_USER and EMAIL_PASS in .env
Frontend Not Showing Data
Check API endpoint URLs
Open browser console for errors
Verify CORS is enabled on backend
📊 Data Flow
ESP32 reads sensors every 10 seconds
ESP32 determines conditions based on thresholds
ESP32 sends JSON data via HTTP POST to backend
Backend validates and saves to MongoDB
Backend checks for alert conditions
Backend sends email if soil or light is "Bad"
Frontend fetches latest data via GET request
Frontend displays real-time dashboard
🆓 Cost Analysis
Service	Tier	Cost
MongoDB Atlas	M0 (512MB)	Free Forever
Render Backend	Free	Free Forever*
Vercel Frontend	Hobby	Free Forever
Gmail SMTP	Personal	Free
Total Monthly Cost		$0.00
*Render free tier sleeps after 15 min inactivity but wakes on request

🔒 Security Notes
Current Implementation:

Basic input validation
No authentication (college project)
Public API endpoints
Production Recommendations:

Add API authentication (JWT)
Implement rate limiting
Restrict CORS origins
Add HTTPS everywhere
Use environment-specific configs
📝 Future Enhancements
 SMS alerts via Telegram Bot
 Mobile app (React Native)
 Multiple plant support
 Advanced analytics & predictions
 Automatic watering system control
 Weather API integration
 Machine learning for optimal conditions
🤝 Contributing
This is an academic project, but suggestions are welcome!

Fork the repository
Create feature branch
Commit changes
Push to branch
Open Pull Request
📄 License
MIT License - Free for educational use

👥 Team
UK DJ's
Contact: sthaujwal07@gmail.com

🙏 Acknowledgments
ESP32 Community
Adafruit Libraries
MongoDB Atlas Free Tier
Render Free Hosting
Vercel Free Hosting
📞 Support
For issues or questions:

Check DEPLOYMENT_STEPS.md first
Review API_DOCUMENTATION.md
Open GitHub issue
Email: sthaujwal07@gmail.com
Last Updated: January 12, 2026
Version: 1.0.0

