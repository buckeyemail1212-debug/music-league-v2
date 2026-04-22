import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { createLeague, League } from '../src/services/api';
import { leagueEvents } from '../src/utils/leagueEvents';
import LeagueAvatar from '../src/components/LeagueAvatar';

const ROUND_CHOICES = [3, 5, 6, 8, 10, 12];
const TIME_CHOICES: { label: string; hours: number }[] = [
  { label: '1 hr', hours: 1 },
  { label: '6 hrs', hours: 6 },
  { label: '12 hrs', hours: 12 },
  { label: '1 day', hours: 24 },
  { label: '2 days', hours: 48 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];

export default function CreateLeaguePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [rounds, setRounds] = useState(6);
  const [submissionHours, setSubmissionHours] = useState(24);
  const [votingHours, setVotingHours] = useState(24);
  const [themesOn, setThemesOn] = useState(false);
  const [themes, setThemes] = useState<string[]>(Array(6).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [createdLeague, setCreatedLeague] = useState<League | null>(null);

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.15,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.15,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handlePhotoTap = () => {
    if (Platform.OS === 'ios') {
      const options = photo
        ? ['Cancel', 'Take Photo', 'Choose from Library', 'Remove Photo']
        : ['Cancel', 'Take Photo', 'Choose from Library'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: photo ? 3 : undefined,
        },
        (i) => {
          if (i === 1) takePhoto();
          else if (i === 2) pickFromLibrary();
          else if (i === 3) setPhoto(null);
        },
      );
    } else {
      Alert.alert('League photo', '', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickFromLibrary },
        ...(photo
          ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => setPhoto(null) }]
          : []),
      ]);
    }
  };

  // Keep the themes array in sync with the selected round count so that
  // toggling rounds after typing doesn't drop or duplicate entries.
  const syncThemesLength = (next: number) => {
    setThemes((prev) => {
      const arr = prev.slice(0, next);
      while (arr.length < next) arr.push('');
      return arr;
    });
  };

  const onRoundsChange = (n: number) => {
    setRounds(n);
    syncThemesLength(n);
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload: Parameters<typeof createLeague>[0] = {
        name: name.trim(),
        total_rounds: rounds,
        submission_hours: submissionHours,
        voting_hours: votingHours,
      };
      if (photo) payload.league_image = photo;
      if (themesOn) {
        payload.themes = themes.map((t) => t.trim());
      }
      const res = await createLeague(payload);
      leagueEvents.emit();
      setCreatedLeague(res.data);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to create league');
    } finally {
      setSubmitting(false);
    }
  };

  const goToLeague = () => {
    if (!createdLeague) return;
    router.replace(`/league/${createdLeague.id}`);
  };

  if (createdLeague) {
    return (
      <SuccessView
        league={createdLeague}
        onGo={goToLeague}
        onClose={() => router.back()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CREATE LEAGUE</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Photo */}
          <View style={styles.photoWrap}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handlePhotoTap}
              style={styles.photoBtn}
            >
              <LeagueAvatar image={photo} size={88} imageBorderRadius={16} />
              {photo && (
                <View style={styles.photoBadge}>
                  <Ionicons name="camera" size={14} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.photoHint}>
              {photo ? 'Tap to change photo' : 'Add a league photo (optional)'}
            </Text>
          </View>

          {/* Name */}
          <Text style={styles.label}>League Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Friday Night Vibes"
            placeholderTextColor="#6A6A6A"
            value={name}
            onChangeText={setName}
            maxLength={60}
            returnKeyType="done"
          />

          {/* Rounds */}
          <Text style={styles.label}>Number of Rounds</Text>
          <ChipRow
            options={ROUND_CHOICES.map((n) => ({ label: String(n), value: n }))}
            value={rounds}
            onChange={(v) => onRoundsChange(v)}
          />

          {/* Submission time */}
          <Text style={styles.label}>Submission Time per Round</Text>
          <ChipRow
            options={TIME_CHOICES.map((t) => ({ label: t.label, value: t.hours }))}
            value={submissionHours}
            onChange={setSubmissionHours}
          />

          {/* Voting time */}
          <Text style={styles.label}>Voting Time per Round</Text>
          <ChipRow
            options={TIME_CHOICES.map((t) => ({ label: t.label, value: t.hours }))}
            value={votingHours}
            onChange={setVotingHours}
          />

          {/* Themes toggle */}
          <View style={styles.themeToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.themeToggleTitle}>Rounds will have themes</Text>
              <Text style={styles.themeToggleSub}>
                Set a prompt for each round (e.g. “Songs about fire”).
              </Text>
            </View>
            <Switch
              value={themesOn}
              onValueChange={setThemesOn}
              trackColor={{ false: '#3A3A3A', true: '#7C3AED' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {themesOn && (
            <View style={styles.themesBlock}>
              {Array.from({ length: rounds }).map((_, i) => (
                <View key={i} style={styles.themeRow}>
                  <View style={styles.themePill}>
                    <Text style={styles.themePillText}>R{i + 1}</Text>
                  </View>
                  <TextInput
                    style={styles.themeInput}
                    placeholder={`Theme for round ${i + 1}`}
                    placeholderTextColor="#6A6A6A"
                    value={themes[i] ?? ''}
                    onChangeText={(txt) => {
                      setThemes((prev) => {
                        const next = [...prev];
                        next[i] = txt;
                        return next;
                      });
                    }}
                    maxLength={80}
                  />
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            onPress={handleCreate}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>CREATE LEAGUE</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={String(opt.value)}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SuccessView({
  league,
  onGo,
  onClose,
}: {
  league: League;
  onGo: () => void;
  onClose: () => void;
}) {
  const code = useMemo(() => league.league_code || '------', [league]);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      Alert.alert('Error', 'Could not copy code.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ width: 26 }} />
        <View style={{ width: 26 }} />
        <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.successWrap}>
        <View style={styles.successBadge}>
          <Ionicons name="checkmark-circle" size={48} color="#10B981" />
        </View>
        <Text style={styles.successTitle}>LEAGUE CREATED</Text>
        <Text style={styles.successName}>{league.name}</Text>
        <Text style={styles.successPrompt}>Share this code with friends to invite them:</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{code}</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleCopy} activeOpacity={0.85}>
          <Text style={styles.shareBtnText}>{copied ? 'COPIED!' : 'COPY CODE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.goBtn} onPress={onGo} activeOpacity={0.85}>
          <Text style={styles.goBtnText}>Go to my league</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBtn: { padding: 6 },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#FFFFFF',
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 60 },

  photoWrap: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  photoBtn: {
    position: 'relative',
  },
  photoBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  photoHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#B3B3B3',
    fontWeight: '500',
  },

  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1.2,
    marginTop: 22,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#181818',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipSelected: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B3B3B3',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },

  themeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 26,
    padding: 14,
    backgroundColor: '#181818',
    borderRadius: 12,
    gap: 12,
  },
  themeToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  themeToggleSub: {
    fontSize: 12,
    color: '#B3B3B3',
    marginTop: 2,
  },
  themesBlock: {
    marginTop: 14,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  themePill: {
    width: 44,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
  },
  themePillText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: 13,
  },
  themeInput: {
    flex: 1,
    backgroundColor: '#181818',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },

  cta: {
    backgroundColor: '#7C3AED',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  ctaDisabled: {
    opacity: 0.35,
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
  },

  // Success state
  successWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
  },
  successBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  successName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#B3B3B3',
    marginTop: 8,
    marginBottom: 28,
    textAlign: 'center',
  },
  successPrompt: {
    fontSize: 13,
    color: '#B3B3B3',
    marginBottom: 12,
    textAlign: 'center',
  },
  codeBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#7C3AED',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(124,58,237,0.08)',
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 8,
  },
  shareBtn: {
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    marginBottom: 12,
    minWidth: 180,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1.4,
  },
  goBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  goBtnText: {
    color: '#B3B3B3',
    fontWeight: '700',
    fontSize: 14,
  },
});
