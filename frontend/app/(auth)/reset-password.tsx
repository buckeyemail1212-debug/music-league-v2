import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { forgotPassword, verifyResetCode, resetPassword } from '../../src/services/api';

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const map = [
    { label: 'Too short', color: colors.danger },
    { label: 'Weak', color: colors.danger },
    { label: 'Fair', color: colors.warning },
    { label: 'Good', color: colors.success },
    { label: 'Strong', color: colors.success },
  ];
  return { score: s, ...map[s] };
}

export default function ResetPasswordScreen() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string>('');

  const router = useRouter();

  const fieldStyle = (field: string) => [
    styles.inputContainer,
    focusedField === field && styles.inputContainerFocused,
  ];

  const onBack = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3);
    else router.back();
  };

  const subtitle =
    step === 1
      ? "Enter your email and we'll send you a reset code."
      : step === 2
      ? `We sent a 6-digit code to ${email}. Enter it below.`
      : 'Choose a new password.';

  // STEP 1 — send the reset code. Always advance on success regardless of
  // whether the account exists — the backend returns the same message.
  const onSendCode = async () => {
    setLoading(true);
    try {
      await forgotPassword(email.toLowerCase().trim());
      setStep(2);
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2 — verify the code.
  const onVerifyCode = async () => {
    setLoading(true);
    try {
      await verifyResetCode(email.toLowerCase().trim(), code.trim());
      setStep(3);
    } catch (e: any) {
      Alert.alert('Invalid code', e?.response?.data?.detail || 'That code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const onResendCode = async () => {
    try {
      await forgotPassword(email.toLowerCase().trim());
      Alert.alert('Code sent', 'Check your email.');
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    }
  };

  // STEP 3 — set the new password, then return to login pre-filled.
  const onResetPassword = async () => {
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', '');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.toLowerCase().trim(), code.trim(), password);
      Alert.alert('Password reset', 'Sign in with your new password.');
      router.replace({ pathname: '/(auth)/login', params: { email: email.toLowerCase().trim() } });
    } catch (e: any) {
      Alert.alert("Couldn't reset password", e?.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <TouchableOpacity style={styles.backButton} onPress={onBack} hitSlop={8} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.heading}>Reset password</Text>
          <Text style={styles.subhead}>{subtitle}</Text>

          <View style={styles.form}>
            {step === 1 && (
              <>
                <View style={fieldStyle('email')}>
                  <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.textPlaceholder}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField('')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    spellCheck={false}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, (!email || loading) && styles.buttonDisabled]}
                  onPress={onSendCode}
                  disabled={!email || loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={styles.buttonText}>Send code</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {step === 2 && (
              <>
                <View style={fieldStyle('code')}>
                  <Ionicons name="keypad-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="6-digit code"
                    placeholderTextColor={colors.textPlaceholder}
                    value={code}
                    onChangeText={setCode}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField('')}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, (code.length < 6 || loading) && styles.buttonDisabled]}
                  onPress={onVerifyCode}
                  disabled={code.length < 6 || loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={styles.buttonText}>Verify code</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.resendWrap} onPress={onResendCode} activeOpacity={0.7}>
                  <Text style={styles.resendText}>Didn't get it? Resend code</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 3 && (
              <>
                <View style={fieldStyle('password')}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="New password"
                    placeholderTextColor={colors.textPlaceholder}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField('')}
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                    autoCorrect={false}
                    textContentType="newPassword"
                    spellCheck={false}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {password.length > 0 && (() => {
                  const strength = passwordStrength(password);
                  return (
                    <View style={styles.strengthRow}>
                      <View style={styles.strengthTrack}>
                        {[0, 1, 2, 3].map((i) => (
                          <View
                            key={i}
                            style={[
                              styles.strengthSegment,
                              { backgroundColor: i < strength.score ? strength.color : colors.surface4 },
                            ]}
                          />
                        ))}
                      </View>
                      <Text style={[styles.strengthLabel, { color: strength.color }]}>
                        {strength.label}
                      </Text>
                    </View>
                  );
                })()}

                <View style={fieldStyle('confirm')}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor={colors.textPlaceholder}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField('confirm')}
                    onBlur={() => setFocusedField('')}
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                    autoCorrect={false}
                    textContentType="newPassword"
                    spellCheck={false}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={onResetPassword}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={styles.buttonText}>Reset password</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subhead: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  form: {
    gap: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface3,
    borderRadius: 16,
    height: 58,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputContainerFocused: {
    borderColor: colors.accent,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    color: colors.textPrimary,
    fontSize: 15,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  strengthTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 52,
    textAlign: 'right',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 29,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  resendWrap: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  resendText: {
    color: colors.accent,
    fontSize: 13.5,
    fontWeight: '600',
  },
});
