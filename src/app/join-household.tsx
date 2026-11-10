
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';

type JoinMode = 'member' | 'owner';

export default function JoinHouseholdScreen() {
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  const [joinMode, setJoinMode] =
    useState<JoinMode>('member');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleJoin() {
    const cleanName = fullName.trim();
    const cleanCode = inviteCode.trim().toUpperCase();
    const cleanRecoveryCode =
      recoveryCode.trim().toUpperCase();

    if (!cleanName) {
      setErrorMessage('Masukkan nama kamu terlebih dahulu.');
      return;
    }

    if (cleanName.length < 2) {
      setErrorMessage('Nama minimal terdiri dari 2 karakter.');
      return;
    }

    if (cleanName.length > 40) {
      setErrorMessage('Nama maksimal 40 karakter.');
      return;
    }

    if (!cleanCode) {
      setErrorMessage('Masukkan kode undangan terlebih dahulu.');
      return;
    }

    if (joinMode === 'owner' && !cleanRecoveryCode) {
      setErrorMessage('Masukkan kode pemulihan Owner.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      // 1. Pastikan ada user Supabase.
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Get user error:', userError);
        setErrorMessage('Sesi pengguna tidak ditemukan.');
        return;
      }

      // 2. Simpan nama pengguna.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            full_name: cleanName,
          },
          { onConflict: 'id' }
        );

      if (profileError) {
        console.error('Profile error:', profileError);
        setErrorMessage(
          'Nama belum berhasil disimpan. Coba lagi.'
        );
        return;
      }

      let householdId: string | null = null;

      // 3. Tentukan proses berdasarkan mode.
      if (joinMode === 'owner') {
        // PEMULIHAN OWNER
        const {
          data,
          error: recoveryError,
        } = await supabase.rpc(
          'recover_household_owner',
          {
            p_invite_code: cleanCode,
            p_recovery_code: cleanRecoveryCode,
          }
        );

        if (recoveryError) {
          console.error(
            'Owner recovery error:',
            recoveryError
          );

          if (
            recoveryError.message.includes(
              'Invalid invite code'
            )
          ) {
            setErrorMessage('Kode undangan tidak valid.');
          } else if (
            recoveryError.message.includes(
              'Invalid recovery code'
            )
          ) {
            setErrorMessage(
              'Kode pemulihan Owner tidak valid.'
            );
          } else {
            setErrorMessage(
              recoveryError.message ||
              'Gagal memulihkan kepemilikan kulkas.'
            );
          }

          return;
        }

        householdId = data as string;

      } else {
        // GABUNG SEBAGAI MEMBER
        const {
          data,
          error: joinError,
        } = await supabase.rpc(
          'join_household_by_code',
          {
            code: cleanCode,
          }
        );

        if (joinError) {
          console.error(
            'Join household error:',
            joinError
          );

          setErrorMessage(
            joinError.message ||
            'Kode undangan tidak valid.'
          );

          return;
        }

        householdId = data as string;
      }

      if (!householdId) {
        setErrorMessage(
          'Kulkas tidak ditemukan atau proses gagal.'
        );
        return;
      }

      // 4. Ambil informasi household.
      const {
        data: household,
        error: householdError,
      } = await supabase
        .from('households')
        .select('name')
        .eq('id', householdId)
        .single();

      if (householdError) {
        console.error(
          'Get household error:',
          householdError
        );
      }

      // 5. Simpan household aktif.
      await AsyncStorage.setItem(
        'activeHouseholdId',
        householdId
      );

      await AsyncStorage.setItem(
        'householdInviteCode',
        cleanCode
      );

      await AsyncStorage.setItem(
        'userName',
        cleanName
      );

      if (household?.name) {
        await AsyncStorage.setItem(
          'householdName',
          household.name
        );
      }

      await AsyncStorage.setItem(
        'onboardingComplete',
        'true'
      );

      // 6. Masuk Home.
      router.replace('/');

    } catch (error) {
      console.error('Join household error:', error);

      setErrorMessage('Terjadi kesalahan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.phone}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* BACK */}
          <Pressable
            style={styles.backButton}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          {/* LOGO */}
          <View style={styles.logoRow}>
            <View style={styles.logo}>
              <Text style={styles.logoIcon}>◒</Text>
            </View>

            <Text style={styles.logoText}>
              IsiKulkas
            </Text>
          </View>

          {/* TITLE */}
          <Text style={styles.title}>
            Gabung kulkas{'\n'}bersama.
          </Text>

          <Text style={styles.description}>
            Pilih bagaimana kamu ingin masuk ke kulkas
            bersama.
          </Text>

          {/* MODE SELECTOR */}
          <View style={styles.modeContainer}>
            <Pressable
              style={[
                styles.modeButton,
                joinMode === 'member' &&
                  styles.modeButtonActive,
              ]}
              onPress={() => {
                setJoinMode('member');
                setErrorMessage('');
              }}
              disabled={loading}
            >
              <Text
                style={[
                  styles.modeTitle,
                  joinMode === 'member' &&
                    styles.modeTitleActive,
                ]}
              >
                👥 Member
              </Text>

              <Text
                style={[
                  styles.modeSubtitle,
                  joinMode === 'member' &&
                    styles.modeSubtitleActive,
                ]}
              >
                Gabung kulkas
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.modeButton,
                joinMode === 'owner' &&
                  styles.modeButtonActive,
              ]}
              onPress={() => {
                setJoinMode('owner');
                setErrorMessage('');
              }}
              disabled={loading}
            >
              <Text
                style={[
                  styles.modeTitle,
                  joinMode === 'owner' &&
                    styles.modeTitleActive,
                ]}
              >
                🔐 Owner
              </Text>

              <Text
                style={[
                  styles.modeSubtitle,
                  joinMode === 'owner' &&
                    styles.modeSubtitleActive,
                ]}
              >
                Pulihkan akses
              </Text>
            </Pressable>
          </View>

          {/* FORM */}
          <View style={styles.formCard}>
            <Text style={styles.label}>
              Nama kamu
            </Text>

            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Contoh: Ratu"
              placeholderTextColor="#A1A8A2"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={40}
              returnKeyType="next"
              editable={!loading}
            />

            <Text style={styles.label}>
              Kode undangan
            </Text>

            <TextInput
              style={styles.input}
              value={inviteCode}
              onChangeText={(value) =>
                setInviteCode(value.toUpperCase())
              }
              placeholder="Contoh: KULKAS-A1B2C3D4"
              placeholderTextColor="#A1A8A2"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />

            {/* OWNER RECOVERY INPUT */}
            {joinMode === 'owner' && (
              <>
                <Text style={styles.label}>
                  Kode pemulihan Owner
                </Text>

                <TextInput
                  style={styles.input}
                  value={recoveryCode}
                  onChangeText={(value) =>
                    setRecoveryCode(value.toUpperCase())
                  }
                  placeholder="Masukkan recovery code"
                  placeholderTextColor="#A1A8A2"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={35}
                  editable={!loading}
                />
              </>
            )}

            {/* INFO */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>
                {joinMode === 'member'
                  ? 'Di mana dapat kodenya?'
                  : 'Pemulihan kepemilikan'}
              </Text>

              <Text style={styles.infoText}>
                {joinMode === 'member'
                  ? 'Minta pemilik kulkas membuka menu Anggota lalu mengirimkan kode undangan kepadamu.'
                  : 'Masukkan kode undangan kulkas dan recovery code yang sebelumnya dibuat oleh Owner.'}
              </Text>
            </View>

            {/* ERROR MESSAGE */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {/* SUBMIT */}
            <Pressable
              style={[
                styles.primaryButton,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleJoin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {joinMode === 'member'
                    ? 'Gabung Kulkas →'
                    : 'Pulihkan sebagai Owner →'}
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.footerText}>
            {joinMode === 'member'
              ? 'Pastikan nama dan kode undangan ditulis dengan benar.'
              : 'Pastikan kedua kode sesuai dengan kulkas yang ingin dipulihkan.'}
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F2',
    alignItems: 'center',
  },

  phone: {
    width: '100%',
    maxWidth: 430,
    flex: 1,
    backgroundColor: '#FAFBF9',
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: 24,
    paddingBottom: 40,
  },

  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E1E5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },

  backText: {
    fontSize: 28,
    lineHeight: 30,
    color: '#515952',
  },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 34,
  },

  logo: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: '#2F7556',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  logoIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },

  logoText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222722',
  },

  title: {
    fontSize: 30,
    lineHeight: 37,
    fontWeight: '700',
    color: '#202520',
  },

  description: {
    fontSize: 13,
    lineHeight: 20,
    color: '#7B837C',
    marginTop: 10,
    marginBottom: 20,
  },

  modeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },

  modeButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1E5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },

  modeButtonActive: {
    borderColor: '#2F7556',
    backgroundColor: '#EDF5F0',
  },

  modeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#606861',
  },

  modeTitleActive: {
    color: '#2F7556',
  },

  modeSubtitle: {
    fontSize: 10,
    color: '#939A94',
    marginTop: 5,
  },

  modeSubtitleActive: {
    color: '#2F7556',
  },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 16,
    padding: 16,
  },

  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#626A63',
    marginBottom: 7,
  },

  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#E0E4E0',
    backgroundColor: '#FAFBFA',
    borderRadius: 10,
    paddingHorizontal: 13,
    fontSize: 14,
    color: '#252A25',
    marginBottom: 14,
  },

  infoBox: {
    backgroundColor: '#F0F6F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },

  infoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2F7556',
  },

  infoText: {
    fontSize: 10,
    lineHeight: 15,
    color: '#6F786F',
    marginTop: 4,
  },

  errorBox: {
    backgroundColor: '#FCEAE7',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 14,
  },

  errorText: {
    color: '#B95242',
    fontSize: 10,
    lineHeight: 16,
  },

  primaryButton: {
    height: 52,
    backgroundColor: '#2F7556',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  footerText: {
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 16,
    color: '#939A94',
    marginTop: 14,
  },
});
