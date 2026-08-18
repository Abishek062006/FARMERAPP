import React from 'react';
import './src/utils/apiAuthInterceptor'; // attaches Firebase auth token to backend requests
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  // this is a repo
  return <RootNavigator />;
}
