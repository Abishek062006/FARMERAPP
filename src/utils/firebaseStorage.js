import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Compress image before uploading
 * Reduces file size by 60-70%
 */
export const compressImage = async (uri, quality = 0.7) => {
  try {
    console.log('🔄 Compressing image...');
    
    const manipResult = await manipulateAsync(
      uri,
      [{ resize: { width: 1000 } }], // Max width 1000px
      { compress: quality, format: SaveFormat.JPEG }
    );
    
    console.log('✅ Image compressed');
    return manipResult.uri;
  } catch (error) {
    console.error('❌ Compression error:', error);
    return uri; // Return original if compression fails
  }
};

/**
 * Generate small thumbnail (200px wide)
 * For profile pictures, list views
 */
export const generateThumbnail = async (uri) => {
  try {
    console.log('🔄 Generating thumbnail...');
    
    const manipResult = await manipulateAsync(
      uri,
      [{ resize: { width: 200 } }],
      { compress: 0.5, format: SaveFormat.JPEG }
    );
    
    console.log('✅ Thumbnail generated');
    return manipResult.uri;
  } catch (error) {
    console.error('❌ Thumbnail error:', error);
    return uri;
  }
};

/**
 * Upload image to Firebase Storage
 * @param {string} uri - Local image URI
 * @param {string} path - Storage path (e.g., "users/uid/profile.jpg")
 * @returns {object} { success: true, url: "download_url" }
 */
export const uploadImage = async (uri, path) => {
  try {
    console.log('📤 Starting upload to:', path);
    
    // Compress image first
    const compressedUri = await compressImage(uri);
    
    // Convert to blob
    const response = await fetch(compressedUri);
    const blob = await response.blob();
    
    console.log('📦 Blob size:', (blob.size / 1024).toFixed(2), 'KB');
    
    // Create storage reference
    const storageRef = ref(storage, path);
    
    // Upload blob to Firebase Storage
    console.log('⬆️ Uploading...');
    await uploadBytes(storageRef, blob);
    
    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    
    console.log('✅ Upload successful!');
    console.log('🔗 URL:', downloadURL);
    
    return { 
      success: true, 
      url: downloadURL 
    };
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * Upload user profile photo
 * Path: users/{userId}/profile.jpg
 */
export const uploadProfilePhoto = async (userId, imageUri) => {
  const path = `users/${userId}/profile.jpg`;
  return await uploadImage(imageUri, path);
};

/**
 * Upload land/farm photo
 * Path: users/{userId}/lands/{landId}/photo_{timestamp}.jpg
 */
export const uploadLandPhoto = async (userId, landId, imageUri) => {
  const timestamp = Date.now();
  const path = `users/${userId}/lands/${landId}/photo_${timestamp}.jpg`;
  return await uploadImage(imageUri, path);
};

/**
 * Upload disease detection photo
 * Path: users/{userId}/lands/{landId}/diseases/disease_{timestamp}.jpg
 */
export const uploadDiseasePhoto = async (userId, landId, imageUri) => {
  const timestamp = Date.now();
  const path = `users/${userId}/lands/${landId}/diseases/disease_${timestamp}.jpg`;
  return await uploadImage(imageUri, path);
};

/**
 * Delete image from Firebase Storage
 * @param {string} path - Storage path to delete
 */
export const deleteImage = async (path) => {
  try {
    console.log('🗑️ Deleting:', path);
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
    console.log('✅ Deleted successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Delete error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get image URL from Storage path
 * @param {string} path - Storage path
 * @returns {string} Download URL
 */
export const getImageURL = async (path) => {
  try {
    const storageRef = ref(storage, path);
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (error) {
    console.error('❌ Get URL error:', error);
    return null;
  }
};
