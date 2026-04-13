import React from 'react';
import { View } from 'react-native';

// This screen is never shown - the Add tab press is intercepted
// by _layout.tsx to show a modal instead
export default function AddScreen() {
  return <View />;
}
