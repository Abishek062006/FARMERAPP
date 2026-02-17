import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

// ⚠️ CHANGE THIS TO YOUR COMPUTER'S IP ADDRESS
const API_URL = 'http://192.168.134.187:5000'; // Update if your IP is different

export default function DiseaseDetectionScreen({ navigation, route }) {
  const { cropId, cropName } = route.params || {};

  const [image, setImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);

  // Request camera permissions
  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permission is required to scan plants');
      return false;
    }
    return true;
  };

  // Take photo with camera
  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
        setResult(null);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  // Pick image from gallery
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
        setResult(null);
      }
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  // Analyze image using Python TensorFlow AI (DIRECT API CALL)
  const analyzeImage = async () => {
    if (!image) {
      Alert.alert('No Image', 'Please capture or select an image first');
      return;
    }

    try {
      setAnalyzing(true);
      console.log('🔍 Analyzing image with Python TensorFlow AI...');

      // Create FormData for image upload
      const formData = new FormData();
      formData.append('image', {
        uri: image,
        type: 'image/jpeg',
        name: 'plant.jpg',
      });

      // Call Python AI disease detection endpoint directly
      console.log('🌐 Calling:', `${API_URL}/api/disease/detect`);
      
      const response = await fetch(`${API_URL}/api/disease/detect`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();
      console.log('📥 Response received:', data.success ? 'Success' : 'Failed');

      if (!response.ok) {
        console.error('❌ API Error:', data.message);
        Alert.alert('Error', data.message || 'Failed to analyze image');
        return;
      }

      if (data.success && data.data) {
        console.log('✅ Disease detection complete');
        console.log('📊 Result:', data.data.healthy ? 'Healthy Plant' : data.data.diseases[0]?.name);
        setResult(data.data);
      } else {
        Alert.alert('Error', data.message || 'Failed to analyze image');
      }

    } catch (error) {
      console.error('❌ Analysis error:', error);
      
      let errorMessage = 'Failed to analyze image. Please try again.';
      
      if (error.message.includes('Network request failed')) {
        errorMessage = 'Cannot connect to server. Please check:\n\n' +
                      '1. Backend is running (npm run dev)\n' +
                      '2. Python AI is running (python app.py)\n' +
                      '3. Your IP address is correct in the code';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Request timed out. The AI service might be slow or not responding.';
      }
      
      Alert.alert('Analysis Failed', errorMessage);
    } finally {
      setAnalyzing(false);
    }
  };

  // Render disease result
  const renderResult = () => {
    if (!result) return null;

    return (
      <View style={styles.resultContainer}>
        {/* Health Status Card */}
        <View style={[
          styles.healthCard,
          { backgroundColor: result.healthy ? '#E8F5E9' : '#FFEBEE' }
        ]}>
          <Ionicons
            name={result.healthy ? 'checkmark-circle' : 'alert-circle'}
            size={40}
            color={result.healthy ? '#4CAF50' : '#F44336'}
          />
          <View style={styles.healthInfo}>
            <Text style={styles.healthStatus}>
              {result.healthy ? 'Plant is Healthy! 🌿' : 'Disease Detected ⚠️'}
            </Text>
            <Text style={styles.healthScore}>
              Confidence: {result.confidence}%
            </Text>
            {result.plantName && (
              <Text style={styles.plantName}>
                Plant: {result.plantName}
              </Text>
            )}
          </View>
        </View>

        {/* Disease Information */}
        {!result.healthy && result.diseases && result.diseases.length > 0 && (
          <View style={styles.diseasesSection}>
            <Text style={styles.sectionTitle}>🦠 Disease Details</Text>
            
            {result.diseases.map((disease, index) => (
              <View key={index} style={styles.diseaseCard}>
                <View style={styles.diseaseHeader}>
                  <Text style={styles.diseaseName}>{disease.name}</Text>
                  <Text style={styles.diseaseProbability}>
                    {disease.probability}% match
                  </Text>
                </View>

                {disease.commonNames && disease.commonNames.length > 0 && (
                  <Text style={styles.commonNames}>
                    Also known as: {disease.commonNames.join(', ')}
                  </Text>
                )}

                {disease.description && (
                  <View style={styles.diseaseDetail}>
                    <Text style={styles.detailLabel}>📋 Description:</Text>
                    <Text style={styles.detailText}>{disease.description}</Text>
                  </View>
                )}

                {disease.cause && (
                  <View style={styles.diseaseDetail}>
                    <Text style={styles.detailLabel}>🔬 Symptoms/Cause:</Text>
                    <Text style={styles.detailText}>{disease.cause}</Text>
                  </View>
                )}

                {/* Treatment Options */}
                {disease.treatment && (
                  <View style={styles.treatmentSection}>
                    <Text style={styles.detailLabel}>💊 Treatment Options:</Text>
                    
                    {disease.treatment.chemical && disease.treatment.chemical.length > 0 && (
                      <View style={styles.treatmentCategory}>
                        <Text style={styles.treatmentType}>Chemical Treatment:</Text>
                        {disease.treatment.chemical.map((item, i) => (
                          <Text key={i} style={styles.treatmentItem}>• {item}</Text>
                        ))}
                      </View>
                    )}

                    {disease.treatment.biological && disease.treatment.biological.length > 0 && (
                      <View style={styles.treatmentCategory}>
                        <Text style={styles.treatmentType}>Biological Treatment:</Text>
                        {disease.treatment.biological.map((item, i) => (
                          <Text key={i} style={styles.treatmentItem}>• {item}</Text>
                        ))}
                      </View>
                    )}

                    {disease.treatment.prevention && disease.treatment.prevention.length > 0 && (
                      <View style={styles.treatmentCategory}>
                        <Text style={styles.treatmentType}>Prevention Tips:</Text>
                        {disease.treatment.prevention.map((item, i) => (
                          <Text key={i} style={styles.treatmentItem}>• {item}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Alternative Predictions */}
        {result.alternatives && result.alternatives.length > 0 && (
          <View style={styles.alternativesSection}>
            <Text style={styles.sectionTitle}>🔍 Other Possibilities:</Text>
            {result.alternatives.map((alt, index) => (
              <View key={index} style={styles.alternativeCard}>
                <Text style={styles.alternativeName}>{alt.name}</Text>
                <Text style={styles.alternativeConfidence}>{alt.confidence}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.newScanButton}
            onPress={() => {
              setImage(null);
              setResult(null);
            }}
          >
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.newScanText}>New Scan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header Info */}
      {cropName && (
        <View style={styles.cropInfo}>
          <Ionicons name="leaf" size={20} color="#fff" />
          <Text style={styles.cropInfoText}>Scanning: {cropName}</Text>
        </View>
      )}

      {/* Image Preview */}
      {image && (
        <View style={styles.imageContainer}>
          <Image source={{ uri: image }} style={styles.previewImage} />
        </View>
      )}

      {/* Camera/Gallery Buttons */}
      {!analyzing && !result && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
            <Ionicons name="camera" size={32} color="#4CAF50" />
            <Text style={styles.actionButtonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={pickImage}>
            <Ionicons name="images" size={32} color="#2196F3" />
            <Text style={styles.actionButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Analyze Button */}
      {image && !analyzing && !result && (
        <TouchableOpacity style={styles.analyzeButton} onPress={analyzeImage}>
          <Ionicons name="search" size={24} color="#fff" />
          <Text style={styles.analyzeButtonText}>Analyze with AI</Text>
        </TouchableOpacity>
      )}

      {/* Loading State */}
      {analyzing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>🤖 Running AI Analysis...</Text>
          <Text style={styles.loadingSubtext}>Using TensorFlow Deep Learning Model</Text>
          <Text style={styles.loadingSubtext}>This may take a few seconds</Text>
        </View>
      )}

      {/* Result Display */}
      {renderResult()}

      {/* Bottom Padding */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  cropInfo: {
    backgroundColor: '#4CAF50',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cropInfoText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  imageContainer: {
    padding: 16,
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  analyzeButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  resultContainer: {
    padding: 16,
  },
  healthCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  healthInfo: {
    flex: 1,
  },
  healthStatus: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  healthScore: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  plantName: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  diseasesSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  diseaseCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  diseaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  diseaseName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
    flex: 1,
  },
  diseaseProbability: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  commonNames: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  diseaseDetail: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  treatmentSection: {
    marginTop: 8,
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
  },
  treatmentCategory: {
    marginTop: 8,
  },
  treatmentType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 4,
  },
  treatmentItem: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    marginBottom: 2,
    lineHeight: 18,
  },
  alternativesSection: {
    marginBottom: 16,
  },
  alternativeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  alternativeName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  alternativeConfidence: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  actionButtons: {
    marginTop: 16,
  },
  newScanButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  newScanText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});