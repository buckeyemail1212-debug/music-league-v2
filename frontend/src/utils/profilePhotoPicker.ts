import {
  ActionSheetIOS,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Kick off the "change your profile photo" flow. Shows a native action
 * sheet (iOS) or alert (Android) with Take Photo / Choose from Library
 * options, runs the appropriate picker, and hands the resulting base64
 * data URL back to the caller.
 *
 * Caller is responsible for persisting (e.g. via AuthContext.updateUser).
 */
export async function chooseProfilePhoto(
  onPicked: (dataUrl: string) => Promise<void> | void,
): Promise<void> {
  const runLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant photo library access.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!res.canceled && res.assets[0].base64) {
      await onPicked(`data:image/jpeg;base64,${res.assets[0].base64}`);
    }
  };

  const runCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant camera access.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!res.canceled && res.assets[0].base64) {
      await onPicked(`data:image/jpeg;base64,${res.assets[0].base64}`);
    }
  };

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
      (i) => {
        if (i === 1) runCamera();
        else if (i === 2) runLibrary();
      },
    );
  } else {
    Alert.alert('Change profile photo', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: runCamera },
      { text: 'Choose from Library', onPress: runLibrary },
    ]);
  }
}
