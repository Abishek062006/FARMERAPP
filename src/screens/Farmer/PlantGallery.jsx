import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  StatusBar,
  Alert,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../constants/colors';

const { width } = Dimensions.get('window');
const imageSize = (width - 60) / 3;

const PlantGallery = ({ navigation, route }) => {
  const { farmingType } = route.params || {};
  const [images, setImages] = useState([]);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    try {
      const saved = await AsyncStorage.getItem(`plantGallery_${farmingType}`);
      if (saved) {
        setImages(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading images:', error);
    }
  };

  const saveImages = async (newImages) => {
    try {
      await AsyncStorage.setItem(
        `plantGallery_${farmingType}`,
        JSON.stringify(newImages)
      );
    } catch (error) {
      console.error('Error saving images:', error);
    }
  };

  const handleAddImage = async (fromCamera = false) => {
    try {
      let result;

      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Please grant camera access');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.7,
          allowsEditing: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Please grant photo library access');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          allowsEditing: true,
        });
      }

      if (!result.canceled) {
        const newImage = {
          uri: result.assets[0].uri,
          timestamp: new Date().toISOString(),
          id: Date.now().toString(),
        };
        const updatedImages = [newImage, ...images];
        setImages(updatedImages);
        saveImages(updatedImages);
      }
    } catch (error) {
      console.error('Error adding image:', error);
      Alert.alert('Error', 'Failed to add image');
    }
  };

  const handleImageOptions = () => {
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: () => handleAddImage(true) },
        { text: 'Choose from Gallery', onPress: () => handleAddImage(false) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleDeleteImage = (imageId) => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedImages = images.filter(img => img.id !== imageId);
            setImages(updatedImages);
            saveImages(updatedImages);
          },
        },
      ]
    );
  };

  const getFarmIcon = () => {
    if (farmingType === 'terrace') return '🏢';
    if (farmingType === 'normal') return '🚜';
    if (farmingType === 'organic') return '🌱';
    return '🌾';
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {getFarmIcon()} Plant Gallery
          </Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleImageOptions}
              activeOpacity={0.8}
            >
              <Text style={styles.addIcon}>📷</Text>
              <Text style={styles.addButtonText}>Add Photo</Text>
            </TouchableOpacity>

            {images.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🌿</Text>
                <Text style={styles.emptyText}>No photos yet</Text>
                <Text style={styles.emptySubtext}>
                  Start documenting your plants!
                </Text>
              </View>
            ) : (
              <View style={styles.gallery}>
                {images.map((image) => (
                  <TouchableOpacity
                    key={image.id}
                    style={styles.imageContainer}
                    onLongPress={() => handleDeleteImage(image.id)}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: image.uri }} style={styles.image} />
                    <Text style={styles.imageDate}>
                      {new Date(image.timestamp).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.secondary,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  placeholder: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  addIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  addButtonText: {
    color: COLORS.secondary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageContainer: {
    width: imageSize,
    marginBottom: 10,
  },
  image: {
    width: imageSize,
    height: imageSize,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  imageDate: {
    fontSize: 10,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
});

export default PlantGallery;
