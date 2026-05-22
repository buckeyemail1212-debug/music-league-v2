import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function CreateJoinSheet({ visible, onClose }: Props) {
  const router = useRouter();

  const goCreate = () => {
    onClose();
    router.push('/create-league' as any);
  };
  const goJoin = () => {
    onClose();
    router.push('/join-league' as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.sheetOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.sheet}>
              <View style={styles.grabber} />
              <Text style={styles.sheetTitle}>What do you want to do?</Text>
              <TouchableOpacity
                style={styles.sheetOption}
                activeOpacity={0.8}
                onPress={goCreate}
              >
                <View style={styles.sheetIconBox}>
                  <Ionicons name="add-circle" size={22} color="#7C3AED" />
                </View>
                <Text style={styles.sheetOptionTitle}>Create League</Text>
                <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetOption}
                activeOpacity={0.8}
                onPress={goJoin}
              >
                <View style={styles.sheetIconBox}>
                  <Ionicons name="enter" size={22} color="#7C3AED" />
                </View>
                <Text style={styles.sheetOptionTitle}>Join League</Text>
                <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetCancel} onPress={onClose}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 12,
  },
  sheetIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(124,58,237,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  sheetCancelText: {
    fontSize: 14,
    color: '#B3B3B3',
    fontWeight: '600',
  },
});
