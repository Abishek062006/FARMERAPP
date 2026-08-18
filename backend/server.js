require('dotenv').config();
const express = require('express');
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
const weatherRoutes = require('./routes/weather');
const listingRoutes = require('./routes/listings');
const mandiRoutes = require('./routes/mandi');
const chatbotRoutes = require('./routes/chatbot');

// ✅ Import ALL models for initialization
require('./models/User');
require('./models/Land');
require('./models/Plot');
require('./models/Crop');
require('./models/Task');
require('./models/Disease');
require('./models/CropListing');

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
app.use('/api/weather',  weatherRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/mandi',    mandiRoutes);
app.use('/api/chatbot',  chatbotRoutes);
// ──────────────────────────────────────────────────────────────────────────

// Health check route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🌾 TN Farming App Backend API - WEEK 1',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    models: ['User', 'Land', 'Plot', 'Crop', 'Task', 'Disease', 'CropListing']
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