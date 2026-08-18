const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// @route   POST /api/users
// @desc    Create new user
// @access  Private — creates the profile for the authenticated caller only
router.post('/', requireAuth, async (req, res) => {
  try {
    console.log('📝 Creating new user...');
    console.log('Request body:', req.body);

    const {
      name,
      email,
      phone,
      role,
      farmingType,
      location,
    } = req.body;
    const firebaseUid = req.firebaseUid; // from verified token, never trust the client for this

    // Validation
    if (!firebaseUid || !name || !email || !phone || !role) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    // Check if user already exists
    let existingUser = await User.findOne({ firebaseUid });
    
    if (existingUser) {
      console.log('⚠️ User already exists');
      return res.status(400).json({
        success: false,
        error: 'User already exists',
      });
    }

    // Create new user
    const user = new User({
      firebaseUid,
      name,
      email,
      phone,
      role,
      farmingType: farmingType || null,
      location: location || null,
    });

    await user.save();

    console.log('✅ User created successfully:', user._id);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      userId: user._id,
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        farmingType: user.farmingType,
        location: user.location,
      },
    });

  } catch (error) {
    console.error('❌ Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

// @route   GET /api/users/firebase/:firebaseUid
// @desc    Get user by Firebase UID
// @access  Private — only the user themself
router.get('/firebase/:firebaseUid', requireAuth, async (req, res) => {
  try {
    if (req.params.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this profile' });
    }

    console.log('🔍 Fetching user by Firebase UID:', req.params.firebaseUid);

    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    console.log('✅ User found:', user._id);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        farmingType: user.farmingType,
        location: user.location,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      },
    });

  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

// @route   PUT /api/users/:firebaseUid
// @desc    Update user
// @access  Private — only the user themself
router.put('/:firebaseUid', requireAuth, async (req, res) => {
  try {
    if (req.params.firebaseUid !== req.firebaseUid) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this profile' });
    }

    console.log('📝 Updating user:', req.params.firebaseUid);

    const user = await User.findOne({ firebaseUid: req.params.firebaseUid });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Update fields
    const updateFields = ['name', 'phone', 'location', 'profileImage', 'farmingType'];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();

    console.log('✅ User updated successfully');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        location: user.location,
        profileImage: user.profileImage,
        farmingType: user.farmingType,
      },
    });

  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message,
    });
  }
});

module.exports = router;
