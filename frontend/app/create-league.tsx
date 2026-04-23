import React, { useState } from 'react';
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
import { createLeague, League } from '../src/services/api';
import { leagueEvents } from '../src/utils/leagueEvents';
import LeagueAvatar from '../src/components/LeagueAvatar';
import LeagueCreatedSuccess from '../src/components/LeagueCreatedSuccess';
import { leagueDraft } from '../src/utils/leagueDraft';

const ROUND_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const TIME_CHOICES: { label: string; hours: number }[] = [
  { label: '1 hr', hours: 1 },
  { label: '6 hrs', hours: 6 },
  { label: '12 hrs', hours: 12 },
  { label: '1 day', hours: 24 },
  { label: '2 days', hours: 48 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];
// When a public league is created, Round 1 auto-starts after this many
// hours. Default 1 day.
const STARTS_IN_CHOICES: { label: string; hours: number }[] = [
  { label: '1 hr', hours: 1 },
  { label: '12 hrs', hours: 12 },
  { label: '1 day', hours: 24 },
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
  const [themesOn, setThemesOn] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [startsInHours, setStartsInHours] = useState(24);
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

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleCreate = async () => {
    if (!canSubmit) return;

    // Themes ON → hand off to the Set Round Themes screen. It owns the
    // actual createLeague call so we don't create a league that's missing
    // the themes the user promised to supply.
    if (themesOn) {
      leagueDraft.set({
        name: name.trim(),
        photo,
        totalRounds: rounds,
        submissionHours,
        votingHours,
        isPublic,
        startsInHours: isPublic ? startsInHours : undefined,
      });
      router.push('/set-round-themes' as any);
      return;
    }

    setSubmitting(true);
    try {
      const payload: Parameters<typeof createLeague>[0] = {
        name: name.trim(),
        total_rounds: rounds,
        submission_hours: submissionHours,
        voting_hours: votingHours,
      };
      if (photo) payload.league_image = photo;
      if (isPublic) {
        payload.is_public = true;
        payload.starts_at = new Date(
          Date.now() + startsInHours * 3600 * 1000,
        ).toISOString();
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
      <LeagueCreatedSuccess
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
              <LeagueAvatar
                variant="upload"
                image={photo}
                size={88}
                imageBorderRadius={16}
              />
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
            onChange={setRounds}
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

          {/* Public league toggle */}
          <View style={styles.themeToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.themeToggleTitle}>Public league</Text>
              <Text style={styles.themeToggleSub}>
                Listed on Public Leagues. No invite code · Round 1 auto-starts on timer.
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: '#3A3A3A', true: '#7C3AED' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {isPublic && (
            <>
              <Text style={styles.label}>Start first round in</Text>
              <ChipRow
                options={STARTS_IN_CHOICES.map((t) => ({ label: t.label, value: t.hours }))}
                value={startsInHours}
                onChange={setStartsInHours}
              />
            </>
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
              <Text style={styles.ctaText}>
                {themesOn ? 'NEXT — SET ROUND THEMES' : 'CREATE LEAGUE'}
              </Text>
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
