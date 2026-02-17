const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const userRoutes = require('./routes/users');
const landRoutes = require('./routes/lands');
const aiRoutes = require('./routes/ai');
const cropRoutes = require('./routes/crops');
const plotRoutes = require('./routes/plots'); // ✅ ADD THIS
const taskRoutes = require('./routes/tasks'); // ✅ ADD THIS
const diseaseRoutes = require('./routes/diseases');
const marketRoutes = require('./routes/market');
const weatherRoutes = require('./routes/weather');




// Load environment variables FIRST
dotenv.config();

// Debug: Check if API key loaded
console.log('🔑 Groq API Key loaded:', process.env.GROQ_API_KEY ? 'YES' : 'NO');
console.log('🔑 Groq API Key value:', process.env.GROQ_API_KEY?.substring(0, 20) + '...');

// ✅ NEW: Import ALL models for initialization
require('./models/User');
require('./models/Land');
require('./models/Plot');        // NEW
require('./models/Crop');
require('./models/Task');        // NEW
require('./models/Disease');     // NEW
require('./models/MarketPrice'); // NEW


// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/lands', landRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/crops', cropRoutes);
app.use('/api/plots', plotRoutes); // ✅ ADD THIS
app.use('/api/tasks', taskRoutes); // ✅ ADD THIS
app.use('/api/diseases', diseaseRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/weather', weatherRoutes);




// Health check route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🌾 TN Farming App Backend API - WEEK 1',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    models: ['User', 'Land', 'Plot', 'Crop', 'Task', 'Disease', 'MarketPrice'] // NEW
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
