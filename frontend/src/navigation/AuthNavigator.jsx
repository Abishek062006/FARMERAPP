import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import PhoneLoginScreen from '../screens/Auth/PhoneLoginScreen';

const Stack = createNativeStackNavigator();

const AuthNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      {/* Phone sign-in is a SECOND door, not a replacement — the email screen
          above is untouched and every existing account keeps working. */}
      <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
