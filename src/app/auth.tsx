import { router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [loading, setLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState('');

  async function handleStart() {
    if (loading) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const {
        data,
        error,
      } =
        await supabase.auth.signInAnonymously();

      if (error) {
        console.error(
          'Anonymous auth error:',
          error
        );

        setErrorMessage(
          error.message
        );
        return;
      }

      if (!data.user) {
        setErrorMessage(
          'Gagal membuat sesi pengguna.'
        );
        return;
      }

      router.replace(
        '/profile-setup'
      );
    } catch (error) {
      console.error(
        'Anonymous login error:',
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

          {/* HERO */}
          <View style={styles.hero}>
            <View
              style={
                styles.illustration
              }
            >
              <Text
                style={
                  styles.illustrationIcon
                }
              >
                🧺
              </Text>
            </View>

            <Text style={styles.title}>
              Kulkas bersama,
              {'\n'}
              lebih teratur.
            </Text>

            <Text
              style={styles.description}
            >
              Catat bahan makanan,
              pantau tanggal kadaluarsa,
              dan kelola isi kulkas
              bersama orang serumah.
            </Text>
          </View>

          {/* BENEFITS */}
          <View
            style={styles.infoCard}
          >
            <View
              style={styles.infoRow}
            >
              <View
                style={
                  styles.infoIcon
                }
              >
                <Text>✓</Text>
              </View>

              <View
                style={
                  styles.infoTextBox
                }
              >
                <Text
                  style={
                    styles.infoTitle
                  }
                >
                  Tidak perlu akun email
                </Text>

                <Text
                  style={
                    styles.infoText
                  }
                >
                  Langsung mulai dan buat
                  kulkas bersama.
                </Text>
              </View>
            </View>

            <View
              style={styles.infoRow}
            >
              <View
                style={
                  styles.infoIcon
                }
              >
                <Text>⌂</Text>
              </View>

              <View
                style={
                  styles.infoTextBox
                }
              >
                <Text
                  style={
                    styles.infoTitle
                  }
                >
                  Berbagi satu kulkas
                </Text>

                <Text
                  style={
                    styles.infoText
                  }
                >
                  Undang anggota lain
                  menggunakan kode.
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.infoRow,
                styles.infoRowLast,
              ]}
            >
              <View
                style={
                  styles.infoIcon
                }
              >
                <Text>◷</Text>
              </View>

              <View
                style={
                  styles.infoTextBox
                }
              >
                <Text
                  style={
                    styles.infoTitle
                  }
                >
                  Pantau makanan
                </Text>

                <Text
                  style={
                    styles.infoText
                  }
                >
                  Lihat bahan yang perlu
                  segera digunakan.
                </Text>
              </View>
            </View>
          </View>

          {/* ERROR */}
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

          {/* CTA */}
          <Pressable
            style={[
              styles.button,
              loading &&
                styles.buttonDisabled,
            ]}
            onPress={handleStart}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.buttonText
                }
              >
                Mulai →
              </Text>
            )}
          </Pressable>

          <Text
            style={styles.footerText}
          >
            Kamu tidak perlu membuat akun
            atau memasukkan email.
          </Text>
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
      marginBottom: 45,
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

    hero: {
      alignItems: 'center',
      marginBottom: 28,
    },

    illustration: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: '#E5F1EA',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
    },

    illustrationIcon: {
      fontSize: 42,
    },

    title: {
      fontSize: 30,
      lineHeight: 37,
      fontWeight: '700',
      color: '#202520',
      textAlign: 'center',
    },

    description: {
      fontSize: 13,
      lineHeight: 20,
      color: '#7B837C',
      textAlign: 'center',
      marginTop: 12,
      paddingHorizontal: 16,
    },

    infoCard: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E1E5E1',
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 4,
      marginBottom: 18,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: '#EEF1EE',
    },

    infoRowLast: {
      borderBottomWidth: 0,
    },

    infoIcon: {
      width: 34,
      height: 34,
      borderRadius: 9,
      backgroundColor: '#E5F1EA',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    infoTextBox: {
      flex: 1,
    },

    infoTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: '#2A302B',
    },

    infoText: {
      fontSize: 10,
      lineHeight: 15,
      color: '#899089',
      marginTop: 3,
    },

    errorBox: {
      backgroundColor: '#FCEAE7',
      borderRadius: 10,
      padding: 11,
      marginBottom: 14,
    },

    errorText: {
      color: '#B95242',
      fontSize: 10,
      lineHeight: 15,
    },

    button: {
      height: 54,
      backgroundColor: '#2F7556',
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },

    buttonDisabled: {
      opacity: 0.6,
    },

    buttonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },

    footerText: {
      textAlign: 'center',
      color: '#9AA19B',
      fontSize: 10,
      marginTop: 13,
    },
  });