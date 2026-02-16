import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

export default function CropDetailScreen({ navigation, route }) {
  const { crop, userData } = route.params || {};
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cropData, setCropData] = useState(crop);
  const [tasks, setTasks] = useState([]);
  const [diseases, setDiseases] = useState([]);
  const [weather, setWeather] = useState(null);
  const [scanningDisease, setScanningDisease] = useState(false);
  const [showDiseaseModal, setShowDiseaseModal] = useState(false);
  const [diseaseResult, setDiseaseResult] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);

  const firebaseUid = userData?.firebaseUid || userData?.uid;

  useEffect(() => {
    if (crop && firebaseUid) {
      loadCropDetails();
    }
  }, [crop, firebaseUid]);

  const loadCropDetails = async () => {
    try {
      setLoading(true);

      // Fetch latest crop data
      const cropResponse = await axios.get(`${API_ENDPOINTS.CROPS}/details/${crop._id}`);
      if (cropResponse.data.success) {
        setCropData(cropResponse.data.crop);
      }

      // Fetch tasks
      try {
        const tasksResponse = await axios.get(`${API_ENDPOINTS.TASKS}/crop/${crop._id}`);
        if (tasksResponse.data.success) {
          setTasks(tasksResponse.data.tasks);
        }
      } catch (err) {
        console.log('No tasks found');
      }

      // Fetch diseases
      try {
        const diseasesResponse = await axios.get(`${API_ENDPOINTS.DISEASES}/crop/${crop._id}`);
        if (diseasesResponse.data.success) {
          const activeDiseases = diseasesResponse.data.diseases.filter(
            d => d.status !== 'resolved'
          );
          setDiseases(activeDiseases);
        }
      } catch (err) {
        console.log('No diseases found');
      }

      // Fetch weather if land has location
      if (cropData?.landId?.location?.coordinates) {
        try {
          const { lat, lng } = cropData.landId.location.coordinates;
          const weatherResponse = await axios.get(
            `${API_ENDPOINTS.WEATHER}/current?lat=${lat}&lng=${lng}`
          );
          if (weatherResponse.data.success) {
            setWeather(weatherResponse.data.weather);
          }
        } catch (err) {
          console.log('Weather unavailable');
        }
      }
    } catch (error) {
      console.error('❌ Error loading crop details:', error);
      Alert.alert('Error', 'Failed to load crop details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadCropDetails();
  };

  const handleScanPlant = () => {
    Alert.alert(
      'Scan Plant Health',
      'Choose an option to detect diseases',
      [
        {
          text: 'Take Photo',
          onPress: () => openCamera(),
        },
        {
          text: 'Choose from Gallery',
          onPress: () => pickImageFromGallery(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to scan plants');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setCapturedImage(result.assets[0].uri);
      await detectDisease(result.assets[0].uri);
    }
  };

  const pickImageFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setCapturedImage(result.assets[0].uri);
      await detectDisease(result.assets[0].uri);
    }
  };

  // FIXED: Complete disease detection function
  const detectDisease = async (imageUri) => {
    try {
      setScanningDisease(true);
      setShowDiseaseModal(true);
      setDiseaseResult(null); // Clear previous result

      console.log('🔍 Detecting disease from image...');

      // Create form data for image upload
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'plant.jpg',
      });

      // Call Python AI disease detection endpoint
      console.log('📍 Calling:', `${API_ENDPOINTS.DISEASES}/detect`);
      
      const response = await axios.post(
        `${API_ENDPOINTS.DISEASES}/detect`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000,
        }
      );

      console.log('✅ Disease detection response:', response.data);

      if (response.data.success && response.data.data) {
        const aiData = response.data.data;
        
        console.log('📊 AI Data:', aiData);
        console.log('📊 Healthy:', aiData.healthy);
        console.log('📊 Diseases:', aiData.diseases);
        
        // Check if plant is healthy
        if (aiData.healthy) {
          Alert.alert('Good News! 🌿', 'Your plant appears healthy!', [
            {
              text: 'OK',
              onPress: () => {
                setShowDiseaseModal(false);
                setCapturedImage(null);
              }
            }
          ]);
        } else {
          // Get disease info
          const disease = aiData.diseases && aiData.diseases.length > 0 ? aiData.diseases[0] : null;
          
          if (!disease) {
            Alert.alert('Error', 'No disease information available');
            setShowDiseaseModal(false);
            setCapturedImage(null);
            return;
          }
          
          console.log('🦠 Disease detected:', disease.name);
          
          // Format treatment data
          let treatmentText = '';
          if (disease.treatment) {
            if (disease.treatment.chemical && Array.isArray(disease.treatment.chemical)) {
              treatmentText = disease.treatment.chemical.join('. ');
            } else if (disease.treatment.biological && Array.isArray(disease.treatment.biological)) {
              treatmentText = disease.treatment.biological.join('. ');
            } else if (typeof disease.treatment === 'string') {
              treatmentText = disease.treatment;
            }
          }
          
          // Format pesticides
          let pesticides = [];
          if (disease.treatment) {
            if (disease.treatment.chemical && Array.isArray(disease.treatment.chemical)) {
              pesticides = disease.treatment.chemical;
            } else if (disease.treatment.biological && Array.isArray(disease.treatment.biological)) {
              pesticides = disease.treatment.biological;
            }
          }
          
          // Format for UI
          const diseaseResultData = {
            isHealthy: false,
            diseaseName: disease.name || 'Unknown Disease',
            scientificName: disease.commonNames && disease.commonNames.length > 0 
              ? disease.commonNames[0] 
              : '',
            severity: 'moderate',
            affectedArea: 'leaves',
            symptoms: disease.cause || disease.description || 'No symptoms information available',
            treatment: treatmentText || 'Consult an agricultural expert for treatment recommendations',
            confidence: (aiData.confidence || disease.probability || 50) / 100,
            pesticides: pesticides
          };
          
          console.log('✅ Setting disease result:', diseaseResultData);
          setDiseaseResult(diseaseResultData);
        }
      } else {
        console.error('❌ Invalid response:', response.data);
        Alert.alert('Error', response.data.message || 'Failed to analyze image');
        setShowDiseaseModal(false);
        setCapturedImage(null);
      }
    } catch (error) {
      console.error('❌ Error detecting disease:', error);
      console.error('❌ Error response:', error.response?.data);
      
      let errorMessage = 'Could not analyze the image. Please try again with a clearer photo.';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. The AI service might be slow.';
      } else if (error.response?.status === 503) {
        errorMessage = 'AI service is not running. Please start the Python server.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      Alert.alert('Detection Failed', errorMessage);
      setShowDiseaseModal(false);
      setCapturedImage(null);
    } finally {
      setScanningDisease(false);
    }
  };

  const handleSaveDisease = async () => {
    if (!diseaseResult) return;

    try {
      const diseaseData = {
        cropId: cropData._id,
        firebaseUid,
        diseaseName: diseaseResult.diseaseName,
        severity: diseaseResult.severity || 'moderate',
        affectedArea: diseaseResult.affectedArea || 'leaves',
        symptoms: diseaseResult.symptoms || '',
        treatment: diseaseResult.treatment || '',
        confidence: diseaseResult.confidence || 0,
        imageUrl: capturedImage,
      };

      const response = await axios.post(API_ENDPOINTS.DISEASES, diseaseData);

      if (response.data.success) {
        Alert.alert('Saved!', 'Disease logged successfully', [
          {
            text: 'OK',
            onPress: () => {
              setShowDiseaseModal(false);
              setCapturedImage(null);
              setDiseaseResult(null);
              loadCropDetails(); // Refresh to show new disease
            }
          }
        ]);
      }
    } catch (error) {
      console.error('❌ Error saving disease:', error);
      Alert.alert('Error', 'Failed to save disease information');
    }
  };

  const getDaysElapsed = () => {
    const today = new Date();
    const planting = new Date(cropData.plantingDate);
    return Math.floor((today - planting) / (1000 * 60 * 60 * 24));
  };

  const getDaysRemaining = () => {
    const elapsed = getDaysElapsed();
    return Math.max(0, cropData.duration - elapsed);
  };

  const getProgress = () => {
    return ((getDaysElapsed() / cropData.duration) * 100).toFixed(1);
  };

  const getStageIcon = (stage) => {
    switch (stage) {
      case 'germination': return '🌱';
      case 'vegetative': return '🌿';
      case 'flowering': return '🌸';
      case 'fruiting': return '🍅';
      case 'harvest': return '🌾';
      case 'completed': return '✅';
      default: return '🌱';
    }
  };

  const getHealthColor = (score) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#F44336';
  };

  const handleUpdateStage = async (newStage) => {
    try {
      const response = await axios.put(`${API_ENDPOINTS.CROPS}/${cropData._id}/stage`, {
        stage: newStage,
      });

      if (response.data.success) {
        Alert.alert('Success', `Stage updated to ${newStage}`);
        loadCropDetails();
      }
    } catch (error) {
      console.error('❌ Error updating stage:', error);
      Alert.alert('Error', 'Failed to update stage');
    }
  };

  const handleMarkHarvested = () => {
    Alert.alert(
      'Mark as Harvested',
      'Are you sure you want to mark this crop as harvested?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Harvest',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await axios.put(
                `${API_ENDPOINTS.CROPS}/${cropData._id}/harvest`,
                { actualYield: 0 }
              );

              if (response.data.success) {
                Alert.alert('Success!', 'Crop marked as harvested', [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]);
              }
            } catch (error) {
              console.error('❌ Error harvesting crop:', error);
              Alert.alert('Error', 'Failed to mark as harvested');
            }
          },
        },
      ]
    );
  };

  const handleDeleteCrop = () => {
    Alert.alert(
      'Delete Crop',
      'Are you sure you want to delete this crop? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await axios.delete(`${API_ENDPOINTS.CROPS}/${cropData._id}`);

              if (response.data.success) {
                Alert.alert('Deleted', 'Crop deleted successfully', [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]);
              }
            } catch (error) {
              console.error('❌ Error deleting crop:', error);
              Alert.alert('Error', 'Failed to delete crop');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading crop details...</Text>
      </View>
    );
  }

  if (!cropData) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={60} color="#ccc" />
        <Text style={styles.errorText}>Crop not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const daysElapsed = getDaysElapsed();
  const daysRemaining = getDaysRemaining();
  const progress = getProgress();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerContent}>
          <View style={styles.cropIconContainer}>
            <Text style={styles.cropStageIcon}>{getStageIcon(cropData.currentStage)}</Text>
          </View>
          <View style={styles.cropInfo}>
            <Text style={styles.cropName}>{cropData.name}</Text>
            <Text style={styles.cropTamilName}>{cropData.tamilName}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color="#666" />
              <Text style={styles.locationText}>
                {cropData.landId?.landName || 'Unknown Land'}
              </Text>
            </View>
          </View>
          <View style={[styles.healthBadge, { backgroundColor: getHealthColor(cropData.healthScore) }]}>
            <Ionicons name="fitness" size={16} color="#fff" />
            <Text style={styles.healthText}>{cropData.healthScore}%</Text>
          </View>
        </View>
      </View>

      {/* Disease Scan Button */}
      <View style={styles.scanSection}>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={handleScanPlant}
        >
          <Ionicons name="scan" size={24} color="#fff" />
          <Text style={styles.scanButtonText}>Scan Plant Health</Text>
          <Ionicons name="camera" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.scanSubtext}>AI-powered disease detection</Text>
      </View>

      {/* Progress Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Growth Progress</Text>
        <View style={styles.progressCard}>
          <View style={styles.progressInfo}>
            <View style={styles.progressItem}>
              <Text style={styles.progressNumber}>{daysElapsed}</Text>
              <Text style={styles.progressLabel}>Days Elapsed</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressItem}>
              <Text style={styles.progressNumber}>{daysRemaining}</Text>
              <Text style={styles.progressLabel}>Days Remaining</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressItem}>
              <Text style={styles.progressNumber}>{progress}%</Text>
              <Text style={styles.progressLabel}>Complete</Text>
            </View>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]} />
            </View>
          </View>
          <Text style={styles.stageName}>
            Stage: {cropData.currentStage.charAt(0).toUpperCase() + cropData.currentStage.slice(1)}
          </Text>
        </View>
      </View>

      {/* Weather Card */}
      {weather && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Weather</Text>
          <View style={styles.weatherCard}>
            <View style={styles.weatherMain}>
              <Ionicons name="partly-sunny" size={40} color="#FF9800" />
              <View style={styles.weatherInfo}>
                <Text style={styles.weatherTemp}>{weather.temperature}°C</Text>
                <Text style={styles.weatherDesc}>{weather.description}</Text>
              </View>
            </View>
            <View style={styles.weatherDetails}>
              <View style={styles.weatherDetail}>
                <Ionicons name="water" size={16} color="#2196F3" />
                <Text style={styles.weatherDetailText}>Humidity: {weather.humidity}%</Text>
              </View>
              <View style={styles.weatherDetail}>
                <Ionicons name="speedometer" size={16} color="#666" />
                <Text style={styles.weatherDetailText}>Wind: {weather.windSpeed} m/s</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Health Issues */}
      {diseases.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health Issues ({diseases.length})</Text>
          <View style={styles.diseasesCard}>
            {diseases.map((disease, index) => (
              <View key={index} style={styles.diseaseItem}>
                <Ionicons name="warning" size={24} color="#F44336" />
                <View style={styles.diseaseContent}>
                  <Text style={styles.diseaseName}>{disease.diseaseName}</Text>
                  <Text style={styles.diseaseStatus}>Status: {disease.status}</Text>
                  {disease.severity && (
                    <Text style={styles.diseaseSeverity}>Severity: {disease.severity}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Tasks Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tasks ({tasks.length})</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('TaskManagement', { crop: cropData, userData })}
          >
            <Ionicons name="add-circle" size={28} color="#4CAF50" />
          </TouchableOpacity>
        </View>
        {tasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="clipboard-outline" size={40} color="#ccc" />
            <Text style={styles.emptyText}>No tasks yet</Text>
          </View>
        ) : (
          <View style={styles.tasksCard}>
            {tasks.slice(0, 5).map((task, index) => (
              <View key={index} style={styles.taskItem}>
                <Ionicons
                  name={task.isCompleted ? 'checkmark-circle' : 'radio-button-off'}
                  size={24}
                  color={task.isCompleted ? '#4CAF50' : '#ccc'}
                />
                <View style={styles.taskContent}>
                  <Text style={[styles.taskTitle, task.isCompleted && styles.taskTitleCompleted]}>
                    {task.title}
                  </Text>
                  <Text style={styles.taskDate}>
                    {new Date(task.date).toLocaleDateString('en-IN')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Crop Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Crop Details</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Variety:</Text>
            <Text style={styles.detailValue}>{cropData.variety}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Quantity:</Text>
            <Text style={styles.detailValue}>{cropData.quantity} {cropData.unit}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Planting Date:</Text>
            <Text style={styles.detailValue}>
              {new Date(cropData.plantingDate).toLocaleDateString('en-IN')}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expected Harvest:</Text>
            <Text style={styles.detailValue}>
              {new Date(cropData.expectedHarvestDate).toLocaleDateString('en-IN')}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Farming Type:</Text>
            <Text style={styles.detailValue}>
              {cropData.farmingType.charAt(0).toUpperCase() + cropData.farmingType.slice(1)}
            </Text>
          </View>
          {cropData.notes && (
            <View style={styles.notesSection}>
              <Text style={styles.detailLabel}>Notes:</Text>
              <Text style={styles.notesText}>{cropData.notes}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.harvestButton}
          onPress={handleMarkHarvested}
          disabled={cropData.isHarvested}
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
          <Text style={styles.harvestButtonText}>
            {cropData.isHarvested ? 'Already Harvested' : 'Mark as Harvested'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteCrop}>
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.deleteButtonText}>Delete Crop</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />

      {/* Disease Detection Modal */}
      <Modal
        visible={showDiseaseModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowDiseaseModal(false);
          setCapturedImage(null);
          setDiseaseResult(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Disease Detection</Text>
              <TouchableOpacity onPress={() => {
                setShowDiseaseModal(false);
                setCapturedImage(null);
                setDiseaseResult(null);
              }}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Captured Image */}
              {capturedImage && (
                <Image
                  source={{ uri: capturedImage }}
                  style={styles.capturedImage}
                  resizeMode="cover"
                />
              )}

              {scanningDisease ? (
                <View style={styles.scanningContainer}>
                  <ActivityIndicator size="large" color="#4CAF50" />
                  <Text style={styles.scanningText}>Analyzing plant health...</Text>
                  <Text style={styles.scanningSubtext}>Using TensorFlow AI Model</Text>
                  <Text style={styles.scanningSubtext}>This may take a few seconds</Text>
                </View>
              ) : diseaseResult ? (
                <View style={styles.resultContainer}>
                  <View style={[
                    styles.resultHeader,
                    diseaseResult.isHealthy && styles.resultHeaderHealthy,
                    !diseaseResult.isHealthy && styles.resultHeaderUnhealthy
                  ]}>
                    <Ionicons
                      name={diseaseResult.isHealthy ? 'checkmark-circle' : 'warning'}
                      size={32}
                      color="#fff"
                    />
                    <Text style={styles.resultHeaderText}>
                      {diseaseResult.isHealthy ? 'Plant is Healthy!' : 'Disease Detected'}
                    </Text>
                  </View>

                  {!diseaseResult.isHealthy && (
                    <>
                      <View style={styles.resultSection}>
                        <Text style={styles.resultLabel}>Disease:</Text>
                        <Text style={styles.resultValue}>{diseaseResult.diseaseName}</Text>
                        {diseaseResult.scientificName && (
                          <Text style={styles.resultScientific}>{diseaseResult.scientificName}</Text>
                        )}
                      </View>

                      {diseaseResult.confidence && (
                        <View style={styles.resultSection}>
                          <Text style={styles.resultLabel}>Confidence:</Text>
                          <Text style={styles.resultValue}>
                            {(diseaseResult.confidence * 100).toFixed(1)}%
                          </Text>
                        </View>
                      )}

                      {diseaseResult.severity && (
                        <View style={styles.resultSection}>
                          <Text style={styles.resultLabel}>Severity:</Text>
                          <Text style={[
                            styles.resultValue,
                            styles.severityText,
                            diseaseResult.severity === 'severe' && styles.severitySevere,
                            diseaseResult.severity === 'moderate' && styles.severityModerate,
                            diseaseResult.severity === 'mild' && styles.severityMild,
                          ]}>
                            {diseaseResult.severity.toUpperCase()}
                          </Text>
                        </View>
                      )}

                      {diseaseResult.symptoms && (
                        <View style={styles.resultSection}>
                          <Text style={styles.resultLabel}>Symptoms:</Text>
                          <Text style={styles.resultText}>{diseaseResult.symptoms}</Text>
                        </View>
                      )}

                      {diseaseResult.treatment && (
                        <View style={styles.resultSection}>
                          <Text style={styles.resultLabel}>Treatment:</Text>
                          <Text style={styles.resultText}>{diseaseResult.treatment}</Text>
                        </View>
                      )}

                      {diseaseResult.pesticides && diseaseResult.pesticides.length > 0 && (
                        <View style={styles.resultSection}>
                          <Text style={styles.resultLabel}>Recommended Pesticides:</Text>
                          {diseaseResult.pesticides.map((pesticide, index) => (
                            <View key={index} style={styles.pesticideItem}>
                              <Ionicons name="medical" size={16} color="#4CAF50" />
                              <Text style={styles.pesticideText}>{pesticide}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.saveButton}
                        onPress={handleSaveDisease}
                      >
                        <Ionicons name="save" size={20} color="#fff" />
                        <Text style={styles.saveButtonText}>Save to Health History</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
  },
  backButton: {
    marginTop: 24,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cropIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropStageIcon: {
    fontSize: 32,
  },
  cropInfo: {
    flex: 1,
  },
  cropName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  cropTamilName: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#666',
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  healthText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  scanSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  scanSubtext: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  section: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  progressCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  progressInfo: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
  },
  progressNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  progressLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
  },
  progressBarContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  stageName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  weatherCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  weatherMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 16,
  },
  weatherInfo: {
    flex: 1,
  },
  weatherTemp: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF9800',
  },
  weatherDesc: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  weatherDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  weatherDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weatherDetailText: {
    fontSize: 13,
    color: '#666',
  },
  emptyCard: {
    backgroundColor: '#fff',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  tasksCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  taskDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  diseasesCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  diseaseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  diseaseContent: {
    flex: 1,
  },
  diseaseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F44336',
  },
  diseaseStatus: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  diseaseSeverity: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  detailsCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  notesSection: {
    paddingTop: 12,
  },
  notesText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginTop: 8,
  },
  actionsSection: {
    paddingHorizontal: 16,
    gap: 12,
  },
  harvestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  harvestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalBody: {
    padding: 20,
  },
  capturedImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
  },
  scanningContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  scanningText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
  },
  scanningSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  resultContainer: {
    gap: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  resultHeaderHealthy: {
    backgroundColor: '#4CAF50',
  },
  resultHeaderUnhealthy: {
    backgroundColor: '#F44336',
  },
  resultHeaderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  resultSection: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  resultValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  resultScientific: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  resultText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  severityText: {
    fontWeight: 'bold',
  },
  severitySevere: {
    color: '#F44336',
  },
  severityModerate: {
    color: '#FF9800',
  },
  severityMild: {
    color: '#4CAF50',
  },
  pesticideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  pesticideText: {
    fontSize: 14,
    color: '#333',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});