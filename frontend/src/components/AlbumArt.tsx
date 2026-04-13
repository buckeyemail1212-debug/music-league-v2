import React, { useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AlbumArtProps {
  uri: string | null | undefined;
  size: number;
  borderRadius: number;
}

export default function AlbumArt({ uri, size, borderRadius }: AlbumArtProps) {
  const [error, setError] = useState(false);

  if (uri && !error) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}>
      <Ionicons name="musical-note" size={size * 0.45} color="#B3B3B3" />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
