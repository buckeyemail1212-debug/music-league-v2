import React, { useState, useEffect } from 'react';
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
import { useAuth } from '../../src/context/AuthContext';
import { checkUsername } from '../../src/services/api';
import { colors } from '../../src/theme/colors';

type Mode = 'signin' | 'signup';

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

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string>('');
  const [debouncedUsername, setDebouncedUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const { login, register } = useAuth();
  const router = useRouter();

  // Debounce username input so we don't hit the availability endpoint per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUsername(username.trim()), 300);
    return () => clearTimeout(t);
  }, [username]);

  // Check availability only in signup mode, length >= 3. Cancelled flag guards
  // against a stale earlier response overwriting a newer one.
  useEffect(() => {
    if (mode !== 'signup' || debouncedUsername.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    let cancelled = false;
    setUsernameStatus('checking');
    checkUsername(debouncedUsername)
      .then(res => { if (!cancelled) setUsernameStatus(res.data.available ? 'available' : 'taken'); })
      .catch(() => { if (!cancelled) setUsernameStatus('idle'); });
    return () => { cancelled = true; };
  }, [debouncedUsername, mode]);

  // ---- Auth logic preserved verbatim from the prior login/register screens ----
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(email.toLowerCase().trim(), password);
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !displayName || !username || !phoneNumber || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await register(email.toLowerCase().trim(), username.trim(), password, phoneNumber.trim(), displayName.trim());
      router.replace('/(tabs)/home');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const isSignup = mode === 'signup';

  // Shared field row. `field` keys the focus state for the accent border.
  const fieldStyle = (field: string) => [
    styles.inputContainer,
    focusedField === field && styles.inputContainerFocused,
  ];

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
          {/* Brand */}
          <Text style={[styles.brand, isSignup && styles.brandSignup]}>Riff</Text>

          {/* Heading + subhead */}
          <Text style={styles.heading}>
            {isSignup ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={styles.subhead}>
            {isSignup ? 'Join the music competition' : 'Sign in to get back in the game'}
          </Text>

          {/* Segmented control */}
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentOption, !isSignup && styles.segmentOptionActive]}
              activeOpacity={0.85}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.segmentLabel, !isSignup && styles.segmentLabelActive]}>
                Sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentOption, isSignup && styles.segmentOptionActive]}
              activeOpacity={0.85}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.segmentLabel, isSignup && styles.segmentLabelActive]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <View style={styles.form}>
            {isSignup && (
              <View style={fieldStyle('name')}>
                <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Name (shown to others)"
                  placeholderTextColor={colors.textPlaceholder}
                  value={displayName}
                  onChangeText={setDisplayName}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField('')}
                  autoComplete="name"
                  autoCorrect={false}
                  textContentType="name"
                  spellCheck={false}
                />
              </View>
            )}

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

            {isSignup && (
              <View style={fieldStyle('username')}>
                <Ionicons name="at-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor={colors.textPlaceholder}
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField('')}
                  autoCapitalize="none"
                  autoComplete="username-new"
                  autoCorrect={false}
                  textContentType="username"
                  spellCheck={false}
                />
                {usernameStatus === 'checking' && (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                )}
                {usernameStatus === 'available' && (
                  <View style={styles.usernameStatus}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.usernameAvailableText}>Available</Text>
                  </View>
                )}
                {usernameStatus === 'taken' && (
                  <Text style={styles.usernameTakenText}>Taken</Text>
                )}
              </View>
            )}

            <View style={fieldStyle('password')}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textPlaceholder}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField('')}
                secureTextEntry={!showPassword}
                autoComplete={isSignup ? 'password-new' : 'password'}
                autoCorrect={false}
                textContentType={isSignup ? 'newPassword' : 'password'}
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

            {isSignup && password.length > 0 && (() => {
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

            {isSignup && (
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
            )}

            {isSignup && (
              <View style={fieldStyle('phone')}>
                <Ionicons name="call-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Phone number"
                  placeholderTextColor={colors.textPlaceholder}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField('')}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  autoCorrect={false}
                  textContentType="telephoneNumber"
                  spellCheck={false}
                />
              </View>
            )}

            {/* Forgot password (signin only) */}
            {!isSignup && (
              <TouchableOpacity
                style={styles.forgotWrap}
                activeOpacity={0.7}
                onPress={() => Alert.alert('Coming soon', 'Password reset is coming soon.')}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {/* Primary button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={isSignup ? handleRegister : handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.buttonText}>{isSignup ? 'Create account' : 'Sign in'}</Text>
              )}
            </TouchableOpacity>

            {/* Legal microcopy (signup only) */}
            {isSignup && (
              <Text style={styles.legal}>
                By creating an account you agree to Riff's{' '}
                <Text style={styles.legalEmphasis}>Terms</Text> and{' '}
                <Text style={styles.legalEmphasis}>Privacy Policy</Text>.
              </Text>
            )}

            {/* Footer switch */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {isSignup ? 'Already have an account? ' : 'New to Riff? '}
              </Text>
              <TouchableOpacity onPress={() => setMode(isSignup ? 'signin' : 'signup')}>
                <Text style={styles.footerLink}>{isSignup ? 'Sign in' : 'Sign up'}</Text>
              </TouchableOpacity>
            </View>
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
  brand: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.5,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 24,
  },
  brandSignup: {
    fontSize: 36,
    marginBottom: 16,
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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface3,
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  segmentOption: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOptionActive: {
    backgroundColor: colors.accent,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.onAccent,
    fontWeight: '700',
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
  usernameStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  usernameAvailableText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.success,
  },
  usernameTakenText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.danger,
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
  forgotWrap: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgotText: {
    color: colors.accent,
    fontSize: 13.5,
    fontWeight: '600',
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
  legal: {
    fontSize: 11.5,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  legalEmphasis: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 14.5,
  },
  footerLink: {
    color: colors.accent,
    fontSize: 14.5,
    fontWeight: '700',
  },
});
