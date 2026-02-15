import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth, 
  getReactNativePersistence 
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ REPLACE THIS WITH YOUR CONFIG FROM FIREBASE CONSOLE!
const firebaseConfig = {
  apiKey: "AIzaSyBZlEqY4IDhrGBWQaQkm1fPuWF8kb9niAU",
  authDomain: "treeapp-a8061.firebaseapp.com",
  projectId: "treeapp-a8061",
  storageBucket: "treeapp-a8061.firebasestorage.app",
  messagingSenderId: "144038513689",
  appId: "1:144038513689:web:d77436781618179b1aae88",
  measurementId: "G-04874P79QL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence
// This keeps user logged in even after app restart
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Storage
const storage = getStorage(app);

console.log('Firebase initialized successfully! ✅');

export { app, auth, storage };
