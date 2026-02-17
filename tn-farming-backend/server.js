require('dotenv').config();
console.log("DATA GOV KEY:", process.env.DATA_GOV_API_KEY);
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const userRoutes = require('./routes/users');
const landRoutes = require('./routes/lands');
const aiRoutes = require('./routes/ai');
const cropRoutes = require('./routes/crops');
const plotRoutes = require('./routes/plots');
const taskRoutes = require('./routes/tasks');
const diseaseRoutes = require('./routes/diseases');
const marketRoutes = require('./routes/market');   // ← single import, no duplicate
const weatherRoutes = require('./routes/weather');

// Load environment variables FIRST
dotenv.config();

// Debug: Check if API key loaded
console.log('🔑 Groq API Key loaded:', process.env.GROQ_API_KEY ? 'YES' : 'NO');
console.log('🔑 Groq API Key value:', process.env.GROQ_API_KEY?.substring(0, 20) + '...');
console.log('🔑 Data.gov.in API Key loaded:', process.env.DATA_GOV_API_KEY ? 'YES' : 'NO'); // NEW

// ✅ Import ALL models for initialization
require('./models/User');
require('./models/Land');
require('./models/Plot');
require('./models/Crop');
require('./models/Task');
require('./models/Disease');
require('./models/MarketPrice');

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// ─── Routes (all original routes preserved) ───────────────────────────────
app.use('/api/users',    userRoutes);
app.use('/api/lands',    landRoutes);
app.use('/api/ai',       aiRoutes);
app.use('/api/crops',    cropRoutes);
app.use('/api/plots',    plotRoutes);
app.use('/api/tasks',    taskRoutes);
app.use('/api/diseases', diseaseRoutes);
app.use('/api/market',   marketRoutes);   // ← ONE line only (removed duplicate)
app.use('/api/weather',  weatherRoutes);
// ──────────────────────────────────────────────────────────────────────────

// Health check route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🌾 TN Farming App Backend API - WEEK 1',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    models: ['User', 'Land', 'Plot', 'Crop', 'Task', 'Disease', 'MarketPrice']
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 ====================================');
  console.log('🚀 TN Farming App Backend API - WEEK 1');
  console.log('🚀 ====================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀 API URL: http://localhost:${PORT}`);
  console.log(`📦 Models loaded: 7`);
  console.log('🚀 ====================================');
  console.log('');
});