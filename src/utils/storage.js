import AsyncStorage from '@react-native-async-storage/async-storage';

export const saveUserData = async (userData) => {
  try {
    await AsyncStorage.setItem('userData', JSON.stringify(userData));
    return true;
  } catch (error) {
    console.error('Error saving user data:', error);
    return false;
  }
};

export const getUserData = async () => {
  try {
    const userData = await AsyncStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

export const removeUserData = async () => {
  try {
    await AsyncStorage.removeItem('userData');
    return true;
  } catch (error) {
    console.error('Error removing user data:', error);
    return false;
  }
};

export const saveUser = async (newUser) => {
  try {
    const usersData = await AsyncStorage.getItem('allUsers');
    const users = usersData ? JSON.parse(usersData) : [];
    
    const existingUser = users.find(user => user.email === newUser.email);
    if (existingUser) {
      return { success: false, message: 'Email already registered' };
    }
    
    users.push(newUser);
    await AsyncStorage.setItem('allUsers', JSON.stringify(users));
    return { success: true, message: 'Registration successful' };
  } catch (error) {
    console.error('Error saving user:', error);
    return { success: false, message: 'Registration failed' };
  }
};

export const verifyLogin = async (email, password) => {
  try {
    const usersData = await AsyncStorage.getItem('allUsers');
    const users = usersData ? JSON.parse(usersData) : [];
    
    const user = users.find(
      u => u.email === email && u.password === password
    );
    
    if (user) {
      const { password, ...userWithoutPassword } = user;
      return { success: true, user: userWithoutPassword };
    }
    
    return { success: false, message: 'Invalid email or password' };
  } catch (error) {
    console.error('Error verifying login:', error);
    return { success: false, message: 'Login failed' };
  }
};
