const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const userRoutes = require('./routes/users');
const landRoutes = require('./routes/lands');
const aiRoutes = require('./routes/ai');
const cropRoutes = require('./routes/crops');
// Load environment variables FIRST
dotenv.config();

// Debug: Check if API key loaded
console.log('🔑 Groq API Key loaded:', process.env.GROQ_API_KEY ? 'YES' : 'NO');
console.log('🔑 Groq API Key value:', process.env.GROQ_API_KEY?.substring(0, 20) + '...');

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

// Health check route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'TN Farming App Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
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
  });
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ====================================');
  console.log('🚀 TN Farming App Backend API');
  console.log('🚀 ====================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV}`);
  console.log(`🚀 API URL: http://localhost:${PORT}`);
  console.log('🚀 ====================================');
  console.log('');
});
