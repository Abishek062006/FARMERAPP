// Base API URL - REPLACE WITH YOUR IP ADDRESS
const API_URL = 'http://172.20.10.3:5000/api'; // ⚠️ Change to YOUR IP!

/**
 * Add new land
 */
export const createLand = async (landData) => {
  try {
    console.log('📝 Creating land via API:', landData.name);

    const response = await fetch(`${API_URL}/lands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(landData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to create land',
      };
    }

    console.log('✅ Land created via API:', data.landId);
    return {
      success: true,
      landId: data.landId,
      land: data.land,
    };

  } catch (error) {
    console.error('❌ Create land error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get all lands for a user
 */
export const getUserLands = async (firebaseUid) => {
  try {
    console.log('🔍 Fetching lands via API for:', firebaseUid);

    const response = await fetch(`${API_URL}/lands/user/${firebaseUid}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to fetch lands',
      };
    }

    console.log('✅ Lands fetched via API:', data.count);
    return {
      success: true,
      lands: data.lands,
      count: data.count,
    };

  } catch (error) {
    console.error('❌ Get lands error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get specific land details
 */
export const getLandById = async (landId) => {
  try {
    console.log('🔍 Fetching land details via API:', landId);

    const response = await fetch(`${API_URL}/lands/${landId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to fetch land',
      };
    }

    console.log('✅ Land fetched via API:', data.land.name);
    return {
      success: true,
      land: data.land,
    };

  } catch (error) {
    console.error('❌ Get land error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Update land
 */
export const updateLand = async (landId, updateData) => {
  try {
    console.log('📝 Updating land via API:', landId);

    const response = await fetch(`${API_URL}/lands/${landId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to update land',
      };
    }

    console.log('✅ Land updated via API');
    return {
      success: true,
      land: data.land,
    };

  } catch (error) {
    console.error('❌ Update land error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Delete land
 */
export const deleteLand = async (landId) => {
  try {
    console.log('🗑️ Deleting land via API:', landId);

    const response = await fetch(`${API_URL}/lands/${landId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API Error:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to delete land',
      };
    }

    console.log('✅ Land deleted via API');
    return {
      success: true,
      message: data.message,
    };

  } catch (error) {
    console.error('❌ Delete land error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
