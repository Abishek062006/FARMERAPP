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
const orderRoutes   = require('./routes/orders');
const offerRoutes   = require('./routes/offers');
const disputeRoutes = require('./routes/disputes');
const requirementRoutes = require('./routes/requirements');
const consignmentRoutes = require('./routes/consignments');
const mandiSaleRoutes = require('./routes/mandiSales');
const warehouseRoutes = require('./routes/warehouses');
const fpoRoutes = require('./routes/fpos');
const fpoMasterRoutes = require('./routes/fpoMaster');
const mandiRoutes = require('./routes/mandi');
const chatbotRoutes = require('./routes/chatbot');
const schemesRoutes = require('./routes/schemes');

// ✅ Import ALL models for initialization
require('./models/User');
require('./models/Offer');
require('./models/Dispute');
require('./models/Requirement');
require('./models/Consignment');
require('./models/Fpo');
require('./models/FpoMaster');
require('./models/FpoAdminClaim');
require('./models/Land');
require('./models/Plot');
require('./models/Crop');
require('./models/Task');
require('./models/Disease');
require('./models/CropListing');
require('./models/ListingImage');
require('./models/Order');
require('./models/SchemeImage');

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
app.use('/api/orders',   orderRoutes);
app.use('/api/offers',   offerRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/requirements', requirementRoutes);
app.use('/api/consignments', consignmentRoutes);
app.use('/api/mandi-sales', mandiSaleRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/fpos',      fpoRoutes);
app.use('/api/fpo-master', fpoMasterRoutes);
app.use('/api/mandi',    mandiRoutes);
app.use('/api/chatbot',  chatbotRoutes);
app.use('/api/schemes',  schemesRoutes);
// ──────────────────────────────────────────────────────────────────────────

// Health check route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🌾 Maharashtra Farming App Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    models: ['User', 'Land', 'Plot', 'Crop', 'Task', 'Disease', 'CropListing', 'ListingImage', 'Order']
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
  console.log('🚀 Maharashtra Farming App Backend API');
  console.log('🚀 ====================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀 API URL: http://localhost:${PORT}`);
  console.log(`📦 Models loaded: 9`);
  console.log('🚀 ====================================');
  console.log('');
});