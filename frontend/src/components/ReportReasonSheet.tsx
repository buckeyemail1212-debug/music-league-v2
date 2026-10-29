import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { reportContent } from '../services/api';
import { colors } from '../theme/colors';

export type ReportTargetType = 'user' | 'story' | 'message' | 'submission';

const REPORT_REASONS = [
  'Spam',
  'Harassment or bullying',
  'Hate speech or symbols',
  'Nudity or sexual content',
  'Other',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  context?: string;
  onReported?: () => void;
  // Callers that show their own follow-up (e.g. "also block?") can
  // suppress the default thank-you alert.
  showSuccessAlert?: boolean;
}

// Cross-platform reason picker for the /report endpoint. A custom
// bottom sheet rather than ActionSheetIOS/Alert so Android isn't
// capped at Alert's 3-button limit.
export default function ReportReasonSheet({
  visible,
  onClose,
  targetType,
  targetId,
  targetLabel,
  context,
  onReported,
  showSuccessAlert = true,
}: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const submit = async (reason: string) => {
    if (submitting || !targetId) return;
    setSubmitting(reason);
    try {
      await reportContent(targetType, targetId, reason, context);
    } catch {
      setSubmitting(null);
      Alert.alert('Could not submit report', 'Please try again.');
      return;
    }
    setSubmitting(null);
    onClose();
    // iOS can drop an Alert presented while a Modal is still animating
    // out, so wait for the fade before following up.
    setTimeout(() => {
      if (showSuccessAlert) {
        Alert.alert('Thanks for reporting', "We'll review this.");
      }
      onReported?.();
    }, 350);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <TouchableWithoutFeedback onPress={close}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.sheetWrap}>
              <View style={styles.optionsGroup}>
                <View style={styles.titleRow}>
                  <Text style={styles.title} numberOfLines={1}>
                    Report {targetLabel || 'this content'}
                  </Text>
                  <Text style={styles.subtitle}>Why are you reporting this?</Text>
                </View>
                {REPORT_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    style={styles.reasonRow}
                    activeOpacity={0.6}
                    onPress={() => submit(reason)}
                    disabled={submitting !== null}
                  >
                    <Text
                      style={[
                        styles.reasonLabel,
                        submitting !== null && submitting !== reason && styles.reasonLabelDim,
                      ]}
                    >
                      {reason}
                    </Text>
                    {submitting === reason && (
                      <ActivityIndicator
                        size="small"
                        color={colors.danger}
                        style={styles.spinner}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.cancelGroup}
                activeOpacity={0.6}
                onPress={close}
                disabled={submitting !== null}
              >
                <Text style={styles.cancelLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  sheetWrap: {
    marginHorizontal: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  optionsGroup: {
    backgroundColor: colors.bg,
    borderRadius: 14,
    overflow: 'hidden',
  },
  titleRow: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
  },
  reasonRow: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reasonLabel: {
    fontSize: 16,
    color: colors.danger,
    textAlign: 'center',
  },
  reasonLabelDim: {
    opacity: 0.4,
  },
  spinner: {
    position: 'absolute',
    right: 20,
  },
  cancelGroup: {
    marginTop: 8,
    backgroundColor: colors.bg,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
