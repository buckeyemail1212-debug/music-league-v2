import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PURPLE = '#7C3AED';

interface Props {
  image?: string | null;
  size: number;
  // Radius used for the image branch (when a photo is present). The empty-state
  // fallback is always a full circle, regardless of this value.
  imageBorderRadius?: number;
}

/**
 * Renders either a league's saved photo inside a rounded square, or — when
 * no photo has been set — a dashed-purple circle with a centered camera
 * icon that invites the creator to add one.
 */
export default function LeagueAvatar({ image, size, imageBorderRadius }: Props) {
  const [errored, setErrored] = useState(false);
  const radius = imageBorderRadius ?? Math.max(6, Math.round(size / 5.5));
  const iconSize = Math.max(14, Math.round(size * 0.42));

  if (image && !errored) {
    return (
      <Image
        source={{ uri: image }}
        onError={() => setErrored(true)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
        }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Ionicons name="camera" size={iconSize} color={PURPLE} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: PURPLE,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
