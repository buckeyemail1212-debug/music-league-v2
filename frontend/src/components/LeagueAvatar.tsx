import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PURPLE = '#7C3AED';

interface BaseProps {
  image?: string | null;
  size: number;
  // Radius used when an image is present. Defaults to a rounded square.
  imageBorderRadius?: number;
}

interface DisplayProps extends BaseProps {
  // "display" variant (default) renders a filled purple square with the
  // league's initials when there's no photo.
  variant?: 'display';
  // League name — required for the initials fallback. Accepts empty string
  // (will fall back to "?").
  name: string;
  // Number of initial letters to show. Defaults to 1 (first letter of the
  // league name), per design. Opt into more by passing 2+.
  maxInitials?: number;
}

interface UploadProps extends BaseProps {
  // "upload" variant is the Create League photo-picker placeholder:
  // a dashed purple circle with a centered camera icon inviting the
  // creator to add a photo.
  variant: 'upload';
  name?: string;
}

type Props = DisplayProps | UploadProps;

// Extract initials from a league name: first letter of each of the first
// `max` whitespace-separated tokens. "Love" → "L", "Friday Night Vibes" →
// "FN" (max=2), "Friday Night Vibes" → "F" (max=1), "" → "?".
function leagueInitials(name: string, max: number = 1): string {
  const tokens = (name || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  const n = Math.max(1, Math.min(max, tokens.length));
  return tokens
    .slice(0, n)
    .map((t) => t[0].toUpperCase())
    .join('');
}

export default function LeagueAvatar(props: Props) {
  const { image, size, imageBorderRadius } = props;
  const [errored, setErrored] = useState(false);
  const radius = imageBorderRadius ?? Math.max(6, Math.round(size / 5.5));

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

  if (props.variant === 'upload') {
    const iconSize = Math.max(14, Math.round(size * 0.42));
    return (
      <View
        style={[
          styles.uploadFallback,
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

  // Default ("display"): filled purple square with initials.
  const initials = leagueInitials(props.name ?? '', props.maxInitials ?? 1);
  const fontSize = Math.max(11, Math.round(size * 0.42));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: PURPLE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize, letterSpacing: 0.5 }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  uploadFallback: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: PURPLE,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
