import React, { useEffect, useState } from 'react';
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
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { createLeague, League } from '../src/services/api';
import { leagueEvents } from '../src/utils/leagueEvents';
import LeagueAvatar from '../src/components/LeagueAvatar';
import LeagueCreatedSuccess from '../src/components/LeagueCreatedSuccess';

const PAGE_BG = '#0a0a0a';
const CARD_BG = '#1a1a1a';
const HAIRLINE = 'rgba(255,255,255,0.08)';
const CHIP_BG = '#2A2A2A';
const INK = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.55)';
const FAINT = '#6A6A6A';
const ACCENT = '#7C3AED';

const STEP_META: Record<number, { title: string; subtitle: string; label: string }> = {
  1: { title: 'Set up your league', subtitle: 'Name it and give it a look.', label: 'Basics' },
  2: { title: 'Name your rounds', subtitle: 'Give each round a theme prompt.', label: 'Themes' },
  3: { title: 'Review & create', subtitle: 'Check everything looks right.', label: 'Confirm' },
};

const ROUND_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
// Time choices must match the backend's ALLOWED_PHASE_HOURS (12, 24, 48,
// 72, 168). Anything outside this set is rejected server-side.
const TIME_CHOICES: { label: string; hours: number }[] = [
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
// Public-league member cap picker: 10..100 in steps of 10. Default 50.
const MEMBER_CAP_CHOICES: number[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const DEFAULT_MEMBER_CAP = 50;
const GENRE_MAX_LENGTH = 50;

export default function CreateLeaguePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [rounds, setRounds] = useState(3);
  const [submissionHours, setSubmissionHours] = useState(48);
  const [votingHours, setVotingHours] = useState(72);
  const [themesOn, setThemesOn] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [startsInHours, setStartsInHours] = useState(24);
  const [memberCap, setMemberCap] = useState<number>(DEFAULT_MEMBER_CAP);
  const [memberCapPickerOpen, setMemberCapPickerOpen] = useState(false);
  const [themes, setThemes] = useState<string[]>(() => Array(3).fill(''));
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [genreError, setGenreError] = useState<string | null>(null);
  const [createdLeague, setCreatedLeague] = useState<League | null>(null);

  useEffect(() => {
    setThemes((prev) => {
      const next = Array(rounds).fill('');
      for (let i = 0; i < Math.min(prev.length, rounds); i++) next[i] = prev[i];
      return next;
    });
  }, [rounds]);

  const totalSteps = themesOn ? 3 : 2;

  const goNext = () => {
    if (step === 1) setStep(themesOn ? 2 : 3);
    else if (step === 2) setStep(3);
  };
  const goBack = () => {
    if (step === 3) setStep(themesOn ? 2 : 1);
    else if (step === 2) setStep(1);
  };

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

  const trimmedGenre = genre.trim();
  const genreRequiredMissing = isPublic && trimmedGenre.length === 0;
  const canSubmit =
    name.trim().length > 0 && !submitting && !genreRequiredMissing;

  const handleCreate = async () => {
    if (isPublic && trimmedGenre.length === 0) {
      setGenreError('Genre is required for public leagues');
      return;
    }
    setGenreError(null);
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
      if (trimmedGenre) payload.genre = trimmedGenre;
      if (themesOn) payload.themes = themes.map((t) => t.trim());
      if (isPublic) {
        payload.is_public = true;
        payload.starts_at = new Date(
          Date.now() + startsInHours * 3600 * 1000,
        ).toISOString();
        payload.member_cap = memberCap;
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
          {/* Stepper */}
          {(() => {
            const dots = themesOn ? [1, 2, 3] : [1, 3];
            const stepIndex = dots.indexOf(step);
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 22 }}>
                {dots.map((s, i) => {
                  const completed = i < stepIndex;
                  const current = s === step;
                  return (
                    <React.Fragment key={s}>
                      {i > 0 && (
                        <View style={{ flex: 1, height: 2, marginHorizontal: 6, backgroundColor: i <= stepIndex ? ACCENT : CHIP_BG, borderRadius: 1 }} />
                      )}
                      {current ? (
                        <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 4, borderColor: 'rgba(124,58,237,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: INK, fontSize: 13, fontWeight: '800' }}>{i + 1}</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: completed ? ACCENT : CHIP_BG, alignItems: 'center', justifyContent: 'center' }}>
                          {completed ? (
                            <Ionicons name="checkmark" size={16} color={INK} />
                          ) : (
                            <Text style={{ color: MUTED, fontSize: 13, fontWeight: '700' }}>{i + 1}</Text>
                          )}
                        </View>
                      )}
                    </React.Fragment>
                  );
                })}
              </View>
            );
          })()}

          {/* Step title */}
          <Text style={{ fontSize: 28, fontWeight: '800', color: INK, letterSpacing: -0.7 }}>
            {STEP_META[step].title}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '500', color: MUTED, marginTop: 4, marginBottom: 8 }}>
            {STEP_META[step].subtitle}
          </Text>

          {step === 1 && (
          <>
          {/* Photo */}
          <View style={styles.photoWrap}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handlePhotoTap}
              style={styles.photoBtn}
            >
              {photo ? (
                <View style={{ position: 'relative' }}>
                  <LeagueAvatar
                    variant="upload"
                    image={photo}
                    size={108}
                    imageBorderRadius={54}
                  />
                  <View style={styles.photoBadge}>
                    <Ionicons name="camera" size={14} color={INK} />
                  </View>
                </View>
              ) : (
                <View style={styles.photoEmpty}>
                  <Ionicons name="camera-outline" size={32} color={MUTED} />
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.photoHint}>
              {photo ? 'Tap to change photo' : 'Add a league photo (optional)'}
            </Text>
          </View>

          {/* Name */}
          <View style={styles.labelRow}>
            <Text style={styles.microLabel}>LEAGUE NAME</Text>
            <Text style={styles.counter}>{name.length}/60</Text>
          </View>
          <TextInput
            style={[styles.input, name.length > 0 && styles.inputActive]}
            placeholder="e.g., Friday Night Vibes"
            placeholderTextColor={FAINT}
            value={name}
            onChangeText={setName}
            maxLength={60}
            returnKeyType="done"
          />

          {/* Genre */}
          <View style={styles.labelRow}>
            <Text style={styles.microLabel}>
              GENRE{isPublic ? '' : ' (OPTIONAL)'}
            </Text>
            <Text style={styles.counter}>
              {genre.length}/{GENRE_MAX_LENGTH}
            </Text>
          </View>
          {trimmedGenre ? (
            <View style={[styles.input, styles.inputActive, { flexDirection: 'row', alignItems: 'center' }]}>
              <View style={styles.genrePill}>
                <Text style={styles.genrePillText}>{trimmedGenre}</Text>
                <TouchableOpacity
                  onPress={() => { setGenre(''); if (genreError) setGenreError(null); }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TextInput
              style={styles.input}
              placeholder="e.g., Indie Rock, 90s Hip-Hop, Chill Vibes"
              placeholderTextColor={FAINT}
              value={genre}
              onChangeText={(v) => {
                setGenre(v);
                if (genreError) setGenreError(null);
              }}
              maxLength={GENRE_MAX_LENGTH}
              returnKeyType="done"
            />
          )}
          {genreError && <Text style={styles.inlineError}>{genreError}</Text>}

          {/* Cadence section */}
          <Text style={styles.sectionLabel}>CADENCE</Text>
          <View style={styles.settingsCard}>
            <Text style={styles.cardFieldLabel}>Number of Rounds</Text>
            <ChipRow
              options={ROUND_CHOICES.map((n) => ({ label: String(n), value: n }))}
              value={rounds}
              onChange={setRounds}
            />

            <View style={styles.cardDivider} />

            <Text style={styles.cardFieldLabel}>Submission Time per Round</Text>
            <ChipRow
              options={TIME_CHOICES.map((t) => ({ label: t.label, value: t.hours }))}
              value={submissionHours}
              onChange={setSubmissionHours}
            />

            <View style={styles.cardDivider} />

            <Text style={styles.cardFieldLabel}>Voting Time per Round</Text>
            <ChipRow
              options={TIME_CHOICES.map((t) => ({ label: t.label, value: t.hours }))}
              value={votingHours}
              onChange={setVotingHours}
            />

            <View style={styles.hintStrip}>
              <View style={styles.hintStripIcon}>
                <Ionicons name="star" size={12} color={INK} />
              </View>
              <Text style={styles.hintStripText}>
                Suggested: 2 days for submission, 3 days for voting.
              </Text>
            </View>
          </View>

          {/* Options section */}
          <Text style={styles.sectionLabel}>OPTIONS</Text>

          {/* Themes toggle */}
          <View style={styles.toggleCard}>
            <View style={styles.toggleIcon}>
              <Ionicons name="color-palette-outline" size={18} color={INK} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.toggleTitle}>Rounds will have themes</Text>
              <Text style={styles.toggleSub}>
                Set a prompt for each round (e.g. "Songs about fire").
              </Text>
            </View>
            <Switch
              value={themesOn}
              onValueChange={setThemesOn}
              trackColor={{ false: CHIP_BG, true: ACCENT }}
              thumbColor={INK}
            />
          </View>

          {/* Public league toggle */}
          <View style={[styles.toggleCard, { marginTop: 10 }]}>
            <View style={styles.toggleIcon}>
              <Ionicons name="globe-outline" size={18} color={INK} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.toggleTitle}>Public league</Text>
              <Text style={styles.toggleSub}>
                Listed on Public Leagues. No invite code · Round 1 auto-starts on timer.
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: CHIP_BG, true: ACCENT }}
              thumbColor={INK}
            />
          </View>

          {isPublic && (
            <>
              <Text style={[styles.cardFieldLabel, { marginTop: 18 }]}>Start first round in</Text>
              <ChipRow
                options={STARTS_IN_CHOICES.map((t) => ({ label: t.label, value: t.hours }))}
                value={startsInHours}
                onChange={setStartsInHours}
              />

              <Text style={[styles.cardFieldLabel, { marginTop: 16 }]}>Max members</Text>
              <TouchableOpacity
                style={styles.pickerField}
                activeOpacity={0.8}
                onPress={() => setMemberCapPickerOpen(true)}
              >
                <Text style={styles.pickerFieldText}>{memberCap}</Text>
                <Ionicons name="chevron-down" size={18} color={MUTED} />
              </TouchableOpacity>
            </>
          )}

          <Modal
            visible={memberCapPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setMemberCapPickerOpen(false)}
          >
            <TouchableOpacity
              style={styles.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setMemberCapPickerOpen(false)}
            >
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerHeader}>Max members</Text>
                <FlatList
                  data={MEMBER_CAP_CHOICES}
                  keyExtractor={(n) => String(n)}
                  renderItem={({ item }) => {
                    const selected = item === memberCap;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.pickerRow,
                          selected && styles.pickerRowSelected,
                        ]}
                        onPress={() => {
                          setMemberCap(item);
                          setMemberCapPickerOpen(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.pickerRowText,
                            selected && styles.pickerRowTextSelected,
                          ]}
                        >
                          {item}
                        </Text>
                        {selected && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={INK}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  showsVerticalScrollIndicator
                />
              </View>
            </TouchableOpacity>
          </Modal>
          </>
          )}

          {step === 2 && (
          <>
          {themes.map((theme, i) => {
            const filled = theme.trim().length > 0;
            const prevFilled = i > 0 && themes[i - 1].trim().length > 0;
            const isLast = i === themes.length - 1;
            return (
              <View key={i} style={styles.themeRow}>
                <View style={styles.themeStatusCol}>
                  {i > 0 && (
                    <View style={[styles.themeConnector, { backgroundColor: prevFilled ? ACCENT : CHIP_BG }]} />
                  )}
                  <View style={[
                    styles.themeCircle,
                    filled
                      ? { backgroundColor: ACCENT }
                      : { backgroundColor: CHIP_BG, borderWidth: 1, borderColor: HAIRLINE },
                  ]}>
                    {filled ? (
                      <Ionicons name="checkmark" size={16} color={INK} />
                    ) : (
                      <Text style={{ color: MUTED, fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
                    )}
                  </View>
                  {!isLast && (
                    <View style={[styles.themeConnectorBelow, { backgroundColor: filled ? ACCENT : CHIP_BG }]} />
                  )}
                </View>
                <View style={[styles.themeCard, filled && styles.themeCardFilled]}>
                  <Text style={styles.themeCardLabel}>ROUND {i + 1}</Text>
                  <TextInput
                    style={styles.themeCardInput}
                    placeholder="Tap to add a prompt..."
                    placeholderTextColor={FAINT}
                    value={theme}
                    onChangeText={(v) => {
                      setThemes((prev) => {
                        const next = [...prev];
                        next[i] = v;
                        return next;
                      });
                    }}
                    maxLength={100}
                    returnKeyType={i === themes.length - 1 ? 'done' : 'next'}
                  />
                </View>
              </View>
            );
          })}
          </>
          )}

          {step === 3 && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Photo</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{photo ? 'Added' : 'None'}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Name</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{name}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Genre</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{trimmedGenre || 'None'}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Rounds</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{rounds}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Submission time</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{submissionHours}h</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Voting time</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{votingHours}h</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Themes</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{themesOn ? 'On' : 'Off'}</Text>
            </View>
            {themesOn && themes.map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingLeft: 12 }}>
                <Text style={{ color: '#B3B3B3', fontSize: 13 }}>R{i + 1}</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 12 }} numberOfLines={1}>{t.trim() || '(empty)'}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
              <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Public</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{isPublic ? 'Yes' : 'No'}</Text>
            </View>
            {isPublic && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
                  <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Start first round in</Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{startsInHours}h</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
                  <Text style={{ color: '#B3B3B3', fontSize: 13 }}>Max members</Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{memberCap}</Text>
                </View>
              </>
            )}
          </>
          )}

          {/* Primary CTA */}
          {(() => {
            const step1Valid = name.trim().length > 0 && !genreRequiredMissing;
            const step2Valid = themes.every((t) => t.trim().length > 0);
            const isConfirm = step === 3;
            const disabled = step === 1 ? !step1Valid : step === 2 ? !step2Valid : !canSubmit;

            const dots = themesOn ? [1, 2, 3] : [1, 3];
            const visualIndex = dots.indexOf(step);
            const actionText = isConfirm ? 'Create league' : step === 2 ? 'Review' : 'Next';
            const hint = `Step ${visualIndex + 1} of ${totalSteps} · ${STEP_META[step].label}`;

            const onPress = isConfirm
              ? handleCreate
              : step === 1
                ? () => { if (step1Valid) goNext(); }
                : () => { if (step2Valid) goNext(); };
            return (
              <TouchableOpacity
                style={[styles.cta, disabled && styles.ctaDisabled]}
                onPress={onPress}
                disabled={disabled}
                activeOpacity={0.85}
              >
                {submitting && isConfirm ? (
                  <ActivityIndicator color={INK} />
                ) : (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ctaAction}>{actionText}</Text>
                      <Text style={styles.ctaHint}>{hint}</Text>
                    </View>
                    <View style={styles.ctaKnob}>
                      <Ionicons name="chevron-forward" size={22} color={ACCENT} />
                    </View>
                  </>
                )}
              </TouchableOpacity>
            );
          })()}

          {step > 1 && (
            <TouchableOpacity
              onPress={goBack}
              activeOpacity={0.7}
              style={{ alignItems: 'center', marginTop: 14 }}
            >
              <Text style={{ color: MUTED, fontWeight: '700', fontSize: 14 }}>Back</Text>
            </TouchableOpacity>
          )}
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
  container: { flex: 1, backgroundColor: PAGE_BG },
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
  scroll: { paddingHorizontal: 24, paddingBottom: 60 },

  photoWrap: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  photoBtn: {
    position: 'relative',
  },
  photoEmpty: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_BG,
  },
  photoBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: CHIP_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PAGE_BG,
  },
  photoHint: {
    marginTop: 10,
    fontSize: 12.5,
    color: MUTED,
    fontWeight: '500',
  },

  microLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: MUTED,
    letterSpacing: 0.6,
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  counter: {
    fontSize: 11,
    color: FAINT,
    fontVariant: ['tabular-nums'],
  },
  inlineError: {
    marginTop: 8,
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: MUTED,
    marginTop: 22,
    marginBottom: 10,
  },
  settingsCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIRLINE,
    padding: 16,
  },
  cardFieldLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: INK,
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  cardDivider: {
    height: 1,
    backgroundColor: HAIRLINE,
    marginVertical: 14,
  },
  hintStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CHIP_BG,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginTop: 14,
    gap: 8,
  },
  hintStripIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintStripText: {
    flex: 1,
    fontSize: 11.5,
    color: MUTED,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIRLINE,
    padding: 16,
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: CHIP_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: INK,
  },
  toggleSub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: MUTED,
    marginTop: 2,
  },
  pickerField: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: HAIRLINE,
    paddingHorizontal: 16,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerFieldText: { color: INK, fontSize: 15, fontWeight: '600' },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSheet: {
    width: '72%',
    maxHeight: '60%',
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIRLINE,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  pickerHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: MUTED,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textTransform: 'uppercase',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  pickerRowSelected: {
    backgroundColor: 'rgba(124,58,237,0.18)',
  },
  pickerRowText: { color: INK, fontSize: 15, fontWeight: '600' },
  pickerRowTextSelected: { color: INK },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
    color: INK,
    fontWeight: '700',
    fontSize: 15,
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  inputActive: {
    borderColor: 'rgba(255,255,255,0.16)',
  },
  genrePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genrePillText: {
    color: INK,
    fontSize: 13,
    fontWeight: '700',
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: CHIP_BG,
  },
  chipSelected: {
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
  },
  chipTextSelected: {
    color: INK,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  themeStatusCol: {
    width: 30,
    alignItems: 'center',
  },
  themeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeConnector: {
    width: 2,
    height: 10,
    borderRadius: 1,
  },
  themeConnectorBelow: {
    width: 2,
    flex: 1,
    borderRadius: 1,
  },
  themeCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HAIRLINE,
    padding: 14,
    marginLeft: 12,
    marginBottom: 6,
  },
  themeCardFilled: {
    borderColor: 'rgba(255,255,255,0.16)',
  },
  themeCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: MUTED,
    marginBottom: 8,
  },
  themeCardInput: {
    color: INK,
    fontWeight: '600',
    fontSize: 14,
    padding: 0,
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: 28,
    height: 56,
    paddingLeft: 20,
    paddingRight: 6,
    marginTop: 32,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaAction: {
    color: INK,
    fontWeight: '800',
    fontSize: 15,
  },
  ctaHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 1,
  },
  ctaKnob: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
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
