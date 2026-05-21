import React, { useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Reusable long-press-to-expand wrapper. Mirrors the inline pattern
// that lived on home.tsx for the league image popup — fullscreen
// dark overlay, 80%-width square container, tap anywhere to dismiss.
//
// Long-press is additive: short-press / tap gestures continue to fall
// through to the wrapped child's parent handlers, so this works on
// avatars that also need tap-to-navigate.

interface ExpandableImageProps {
  source: ImageSourcePropType | null | undefined;
  children: React.ReactNode;
  onShortPress?: () => void;
  fallbackSource?: ImageSourcePropType;
  accessibilityLabel?: string;
  delayLongPress?: number;
  style?: StyleProp<ViewStyle>;
  // When the source can't be resolved to a real image, long-press
  // still fires by default (showing the placeholder/initial). Pass
  // `false` to suppress when there's nothing to expand.
  enabled?: boolean;
}

export default function ExpandableImage({
  source,
  children,
  onShortPress,
  fallbackSource,
  accessibilityLabel,
  delayLongPress = 300,
  style,
  enabled = true,
}: ExpandableImageProps) {
  const [open, setOpen] = useState(false);

  const resolved = source ?? fallbackSource ?? null;

  const onLongPress = () => {
    if (!enabled) return;
    setOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={onShortPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        accessibilityLabel={accessibilityLabel}
        style={style}
      >
        {children}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.container}>
            {resolved ? (
              <Image source={resolved as any} style={styles.image} resizeMode="contain" />
            ) : (
              // Default-avatar surface — long-press still gives the
              // user visual feedback when no photo is set, but
              // there's nothing photographic to expand.
              <View style={[styles.image, styles.imageFallback]}>
                <Ionicons name="person" size={120} color="#7C3AED" />
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    aspectRatio: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  imageFallback: {
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
