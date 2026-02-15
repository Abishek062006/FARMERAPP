// Base API URL - REPLACE WITH YOUR COMPUTER'S IP ADDRESS
const API_URL = 'http://192.168.1.7:5000/api'; // ⚠️ Change to YOUR IP!

/**
 * Create a new user in MongoDB via backend API
 */
export const createUser = async (userData) => {
  try {
    console.log('📝 Creating user via API:', userData.email);

    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to create user',
      };
    }

    console.log('✅ User created via API:', data.userId);
    return {
      success: true,
      userId: data.userId,
      user: data.user,
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Request timeout - Backend not responding');
      return {
        success: false,
        error: 'Connection timeout. Please check your network.',
      };
    }
    
    console.error('❌ Create user error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get user by Firebase UID from MongoDB via backend API
 */
export const getUserByFirebaseUid = async (firebaseUid) => {
  try {
    console.log('🔍 Fetching user via API:', firebaseUid);

    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(`${API_URL}/users/firebase/${firebaseUid}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'User not found',
      };
    }

    console.log('✅ User fetched via API:', data.user.email);
    console.log('🔍 Backend returned firebaseUid:', data.user.firebaseUid); // ✅ DEBUG
    
    // ✅ Return user data with firebaseUid
    return {
      success: true,
      user: {
        ...data.user,
        firebaseUid: data.user.firebaseUid || firebaseUid, // Use backend's or fallback
      },
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Request timeout - Backend not responding');
      return {
        success: false,
        error: 'Connection timeout',
      };
    }
    
    console.error('❌ Get user error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Update user information via backend API
 */
export const updateUser = async (firebaseUid, updateData) => {
  try {
    console.log('📝 Updating user via API:', firebaseUid);

    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(`${API_URL}/users/${firebaseUid}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to update user',
      };
    }

    console.log('✅ User updated via API');
    return {
      success: true,
      user: data.user,
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Request timeout - Backend not responding');
      return {
        success: false,
        error: 'Connection timeout',
      };
    }
    
    console.error('❌ Update user error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
