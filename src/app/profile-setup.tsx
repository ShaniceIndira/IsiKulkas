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

export default function ProfileSetupScreen() {
  const [name, setName] = useState('');
  const [householdName, setHouseholdName] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState('');

  async function handleCreateHousehold() {
    const cleanName = name.trim();
    const cleanHouseholdName =
      householdName.trim();

    if (!cleanName) {
      setErrorMessage(
        'Masukkan nama kamu terlebih dahulu.'
      );
      return;
    }

    if (!cleanHouseholdName) {
      setErrorMessage(
        'Masukkan nama kulkas terlebih dahulu.'
      );
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      // 1. Ambil user Supabase saat ini
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error(
          'Get user error:',
          userError
        );

        setErrorMessage(
          'Gagal membaca sesi pengguna.'
        );
        return;
      }

      if (!user) {
        setErrorMessage(
          'Sesi pengguna tidak ditemukan. Coba mulai ulang aplikasi.'
        );

        router.replace('/auth');
        return;
      }

      // 2. Simpan nama ke profile
      const {
        error: profileError,
      } = await supabase
        .from('profiles')
        .update({
          full_name: cleanName,
        })
        .eq('id', user.id);

      if (profileError) {
        console.error(
          'Profile update error:',
          profileError
        );

        setErrorMessage(
          'Gagal menyimpan nama pengguna.'
        );
        return;
      }

      // 3. Buat household lewat RPC
      const {
        data: householdId,
        error: householdError,
      } = await supabase.rpc(
        'create_household',
        {
          household_name:
            cleanHouseholdName,
        }
      );

      if (householdError) {
        console.error(
          'Create household error:',
          householdError
        );

        setErrorMessage(
          householdError.message ||
            'Gagal membuat kulkas.'
        );
        return;
      }

      if (!householdId) {
        setErrorMessage(
          'Kulkas gagal dibuat.'
        );
        return;
      }

      // 4. Simpan active household lokal
      await AsyncStorage.setItem(
        'activeHouseholdId',
        householdId
      );

      await AsyncStorage.setItem(
        'userName',
        cleanName
      );

      await AsyncStorage.setItem(
        'householdName',
        cleanHouseholdName
      );

      // Legacy flag sementara
      await AsyncStorage.setItem(
        'onboardingComplete',
        'true'
      );

      // 5. Masuk Home
      router.replace('/');
    } catch (error) {
      console.error(
        'Profile setup error:',
        error
      );

      setErrorMessage(
        'Terjadi kesalahan. Coba lagi.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View style={styles.phone}>
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          {/* LOGO */}
          <View style={styles.logoRow}>
            <View style={styles.logo}>
              <Text
                style={styles.logoIcon}
              >
                ◒
              </Text>
            </View>

            <Text
              style={styles.logoText}
            >
              IsiKulkas
            </Text>
          </View>

          {/* TITLE */}
          <Text style={styles.title}>
            Kulkas bersama,
            {'\n'}
            lebih teratur.
          </Text>

          <Text
            style={styles.description}
          >
            Siapkan profil kamu lalu buat
            kulkas untuk mulai mencatat
            bahan makanan bersama.
          </Text>

          {/* FORM */}
          <View style={styles.formCard}>
            <Text style={styles.label}>
              Nama kamu
            </Text>

            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Contoh: Shanice"
              placeholderTextColor="#A1A8A2"
              autoCapitalize="words"
            />

            <Text style={styles.label}>
              Nama kulkas
            </Text>

            <TextInput
              style={styles.input}
              value={householdName}
              onChangeText={
                setHouseholdName
              }
              placeholder="Contoh: Kulkas Apartemen"
              placeholderTextColor="#A1A8A2"
              autoCapitalize="sentences"
            />

            {errorMessage ? (
              <View
                style={styles.errorBox}
              >
                <Text
                  style={
                    styles.errorText
                  }
                >
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.primaryButton,
                loading &&
                  styles.buttonDisabled,
              ]}
              onPress={
                handleCreateHousehold
              }
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Buat Kulkas →
                </Text>
              )}
            </Pressable>
          </View>

          {/* JOIN EXISTING */}
          <View style={styles.joinCard}>
            <View style={styles.joinIcon}>
              <Text
                style={styles.joinEmoji}
              >
                👥
              </Text>
            </View>

            <View style={styles.joinInfo}>
              <Text
                style={styles.joinTitle}
              >
                Sudah punya kode kulkas?
              </Text>

              <Text
                style={styles.joinText}
              >
                Gabung ke kulkas yang sudah
                dibuat anggota lain.
              </Text>
            </View>

            <Pressable
              onPress={() =>
                router.push(
                  '/join-household'
                )
              }
            >
              <Text
                style={styles.joinArrow}
              >
                ›
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
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
      paddingTop: 30,
      paddingBottom: 40,
    },

    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 38,
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
      marginBottom: 24,
    },

    formCard: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E1E5E1',
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },

    label: {
      fontSize: 11,
      fontWeight: '600',
      color: '#626A63',
      marginBottom: 7,
    },

    input: {
      height: 50,
      borderWidth: 1,
      borderColor: '#E0E4E0',
      backgroundColor: '#FAFBFA',
      borderRadius: 10,
      paddingHorizontal: 13,
      fontSize: 13,
      color: '#252A25',
      marginBottom: 15,
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

    joinCard: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E1E5E1',
      borderRadius: 14,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
    },

    joinIcon: {
      width: 42,
      height: 42,
      borderRadius: 11,
      backgroundColor: '#E5F1EA',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    joinEmoji: {
      fontSize: 19,
    },

    joinInfo: {
      flex: 1,
    },

    joinTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: '#282D29',
    },

    joinText: {
      fontSize: 10,
      lineHeight: 15,
      color: '#8A918B',
      marginTop: 3,
    },

    joinArrow: {
      fontSize: 26,
      color: '#6E776F',
      paddingHorizontal: 6,
    },
  });