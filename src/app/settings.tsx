import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import {
  useCallback,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  cancelAllExpiryNotifications,
  requestNotificationPermission,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';

export default function SettingsScreen() {
  const [userName, setUserName] =
    useState('');

  const [
    householdName,
    setHouseholdName,
  ] = useState('');

  const [householdId, setHouseholdId] =
    useState<string | null>(null);

  // Fitur pemulihan khusus Owner.
  const [isHouseholdOwner, setIsHouseholdOwner] =
    useState(false);

  const [recoveryCode, setRecoveryCode] =
    useState('');

  const [generatingRecoveryCode, setGeneratingRecoveryCode] =
    useState(false);

  const [
    notificationEnabled,
    setNotificationEnabled,
  ] = useState(true);

  const [
    expiryReminderEnabled,
    setExpiryReminderEnabled,
  ] = useState(true);

  // Status Premium dibaca dan disimpan di Supabase.
  const [premiumEnabled, setPremiumEnabled] =
    useState(false);

  const [premiumSaving, setPremiumSaving] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [
    signingOut,
    setSigningOut,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function loadSettings() {
        try {
          setLoading(true);
          setErrorMessage('');

          const {
            data: { user },
            error: userError,
          } =
            await supabase.auth.getUser();

          if (
            userError ||
            !user ||
            !isMounted
          ) {
            if (isMounted) {
              router.replace('/auth');
            }

            return;
          }

          const [
            notificationSetting,
            expirySetting,
            savedHouseholdId,
          ] = await Promise.all([
            AsyncStorage.getItem(
              'notificationEnabled'
            ),

            AsyncStorage.getItem(
              'expiryReminderEnabled'
            ),

            AsyncStorage.getItem(
              'activeHouseholdId'
            ),
          ]);

          if (!isMounted) {
            return;
          }

          /*
            Default ON kalau setting
            belum pernah disimpan.
          */
          setNotificationEnabled(
            notificationSetting !==
              'false'
          );

          setExpiryReminderEnabled(
            expirySetting !== 'false'
          );

          const {
            data: profile,
          } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle();

          if (
            isMounted &&
            profile?.full_name
          ) {
            setUserName(
              profile.full_name
            );
          }

          let householdId =
            savedHouseholdId;

          if (!householdId) {
            const {
              data: membership,
            } = await supabase
              .from(
                'household_members'
              )
              .select('household_id')
              .eq(
                'user_id',
                user.id
              )
              .limit(1)
              .maybeSingle();

            householdId =
              membership?.household_id ||
              null;

            if (householdId) {
              await AsyncStorage.setItem(
                'activeHouseholdId',
                householdId
              );
            }
          }

          if (!isMounted) {
            return;
          }

          setHouseholdId(householdId);

          if (householdId) {
            // Cek role pengguna pada household aktif.
            const {
              data: ownerMembership,
              error: ownerMembershipError,
            } = await supabase
              .from('household_members')
              .select('role')
              .eq('household_id', householdId)
              .eq('user_id', user.id)
              .maybeSingle();

            if (ownerMembershipError) {
              throw ownerMembershipError;
            }

            if (isMounted) {
              setIsHouseholdOwner(
                ownerMembership?.role === 'owner'
              );
            }

            const {
              data: household,
              error: householdError,
            } = await supabase
              .from('households')
              .select('name')
              .eq(
                'id',
                householdId
              )
              .maybeSingle();

            if (householdError) {
              throw householdError;
            }

            if (isMounted) {
              setHouseholdName(
                household?.name || ''
              );
            }

            // Premium dibaca berdasarkan household,
            // sehingga statusnya sama untuk semua anggota.
            const {
              data: entitlement,
              error: entitlementError,
            } = await supabase
              .from('household_entitlements')
              .select('plan')
              .eq('household_id', householdId)
              .maybeSingle();

            if (entitlementError) {
              throw entitlementError;
            }

            if (!entitlement) {
              throw new Error(
                'Status membership household tidak ditemukan. Pastikan data household_entitlements sudah tersedia.'
              );
            }

            if (isMounted) {
              setPremiumEnabled(
                entitlement.plan === 'premium'
              );
            }
          } else {
            setHouseholdName('');
            setPremiumEnabled(false);
            setIsHouseholdOwner(false);
            setRecoveryCode('');
          }
        } catch (error) {
          console.error(
            'Load settings error:',
            error
          );

          if (isMounted) {
            setErrorMessage(
              'Gagal memuat pengaturan.'
            );
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      }

      loadSettings();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  async function handleNotificationToggle(
    value: boolean
  ) {
    try {
      setErrorMessage('');

      /*
        Kalau user menyalakan
        Notifikasi di HP, minta
        permission sistem.
      */
      if (
        value &&
        Platform.OS !== 'web'
      ) {
        const permissionGranted =
          await requestNotificationPermission();

        if (!permissionGranted) {
          setNotificationEnabled(
            false
          );

          await AsyncStorage.setItem(
            'notificationEnabled',
            'false'
          );

          setErrorMessage(
            'Izin notifikasi belum diberikan.'
          );

          return;
        }
      }

      setNotificationEnabled(value);

      await AsyncStorage.setItem(
        'notificationEnabled',
        String(value)
      );

      /*
        Master notification OFF =
        semua expiry reminder yang sudah
        terjadwal di device ini dibatalkan.
      */
      if (!value) {
        await cancelAllExpiryNotifications();
      }
    } catch (error) {
      console.error(
        'Notification toggle error:',
        error
      );

      setErrorMessage(
        'Gagal mengubah pengaturan notifikasi.'
      );
    }
  }

  async function handleExpiryToggle(
    value: boolean
  ) {
    try {
      setErrorMessage('');

      setExpiryReminderEnabled(
        value
      );

      await AsyncStorage.setItem(
        'expiryReminderEnabled',
        String(value)
      );

      /*
        User bebas menyimpan:
        Notification OFF
        Expiry reminder ON

        Tapi selama master notification
        OFF, reminder tidak akan dikirim.

        Kalau expiry reminder dimatikan,
        hapus reminder yang sudah dijadwalkan.
      */
      if (!value) {
        await cancelAllExpiryNotifications();
      }
    } catch (error) {
      console.error(
        'Expiry toggle error:',
        error
      );

      setErrorMessage(
        'Gagal mengubah pengingat kadaluarsa.'
      );
    }
  }

  async function handlePremiumToggle(
    value: boolean
  ) {
    if (premiumSaving) {
      return;
    }

    try {
      setPremiumSaving(true);
      setErrorMessage('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw userError ||
          new Error('Pengguna tidak ditemukan.');
      }

      if (!householdId) {
        throw new Error(
          'Household tidak ditemukan. Silakan buka ulang Settings.'
        );
      }

      const {
        data,
        error,
      } = await supabase
        .from('household_entitlements')
        .update({
          plan: value ? 'premium' : 'free',
          updated_at: new Date().toISOString(),
        })
        .eq('household_id', householdId)
        .select('plan')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          'Status membership tidak ditemukan. Coba buka ulang Settings.'
        );
      }

      setPremiumEnabled(data.plan === 'premium');
    } catch (error) {
      console.error('Premium toggle error:', error);
      setErrorMessage(
        'Gagal mengubah status Premium. Silakan coba lagi.'
      );
    } finally {
      setPremiumSaving(false);
    }
  }

  async function handleGenerateRecoveryCode() {
    if (generatingRecoveryCode) {
      return;
    }

    try {
      setGeneratingRecoveryCode(true);
      setErrorMessage('');

      if (!householdId) {
        throw new Error(
          'Household tidak ditemukan. Silakan buka ulang Settings.'
        );
      }

      // RPC akan memverifikasi kembali bahwa pemanggil adalah Owner.
      const {
        data,
        error,
      } = await supabase.rpc(
        'generate_owner_recovery_code',
        {
          p_household_id: householdId,
        }
      );

      if (error) {
        throw error;
      }

      if (typeof data !== 'string' || !data.trim()) {
        throw new Error(
          'Recovery code tidak berhasil dibuat. Silakan coba lagi.'
        );
      }

      setRecoveryCode(data);
    } catch (error) {
      console.error(
        'Generate owner recovery code error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Gagal membuat Owner Recovery Code.'
      );
    } finally {
      setGeneratingRecoveryCode(false);
    }
  }

  async function handleLogout() {
    if (signingOut) {
      return;
    }

    try {
      setSigningOut(true);
      setErrorMessage('');

      /*
        Karena akun sekarang anonymous,
        reminder lokal juga kita bersihkan
        sebelum keluar.
      */
      await cancelAllExpiryNotifications();

      const { error } =
        await supabase.auth.signOut();

      if (error) {
        setErrorMessage(
          error.message
        );

        return;
      }

      await AsyncStorage.multiRemove([
        'activeHouseholdId',
        'householdName',
        'householdInviteCode',
        'userName',
        'onboardingComplete',
        'notificationEnabled',
        'expiryReminderEnabled',
      ]);

      router.replace('/auth');
    } catch (error) {
      console.error(
        'Logout error:',
        error
      );

      setErrorMessage(
        'Gagal keluar dari perangkat.'
      );
    } finally {
      setSigningOut(false);
    }
  }

  const initial =
    userName.trim().charAt(0)
      .toUpperCase() || '?';

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View style={styles.phone}>
          <View
            style={
              styles.loadingContainer
            }
          >
            <ActivityIndicator
              color="#2F7556"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Memuat pengaturan...
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View style={styles.phone}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          <Text
            style={styles.title}
          >
            Pengaturan
          </Text>

          <Text
            style={styles.subtitle}
          >
            Kelola profil dan kulkas
            bersama.
          </Text>

          <View
            style={styles.profileCard}
          >
            <View
              style={styles.avatar}
            >
              <Text
                style={
                  styles.avatarText
                }
              >
                {initial}
              </Text>
            </View>

            <View
              style={
                styles.profileInfo
              }
            >
              <Text
                style={
                  styles.profileName
                }
              >
                {userName ||
                  'Pengguna IsiKulkas'}
              </Text>

              <Text
                style={
                  styles.householdText
                }
              >
                {householdName ||
                  'Kulkas bersama'}
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.sectionTitle
            }
          >
            Kulkas bersama
          </Text>

          <View
            style={styles.card}
          >
            <Pressable
              style={styles.menuRow}
              onPress={() =>
                router.push(
                  '/members'
                )
              }
            >
              <View
                style={styles.menuIcon}
              >
                <Text>👥</Text>
              </View>
 <View
                style={
                  styles.menuInfo
                }
              >
                <Text
                  style={
                    styles.menuTitle
                  }
                >
                  Anggota
                </Text>

                <Text
                  style={
                    styles.menuSubtitle
                  }
                >
                  Lihat anggota dan kode
                  undangan
                </Text>
              </View>

              <Text
                style={
                  styles.chevron
                }
              >
                ›
              </Text>
            </Pressable>

            <View
              style={styles.divider}
            />

            <Pressable
              style={styles.menuRow}
              onPress={() =>
                router.push(
                  '/history'
                )
              }
            >
              <View
                style={styles.menuIcon}
              >
                <Text>◉</Text>
              </View>

              <View
                style={
                  styles.menuInfo
                }
              >
                <Text
                  style={
                    styles.menuTitle
                  }
                >
                  Riwayat
                </Text>

                <Text
                  style={
                    styles.menuSubtitle
                  }
                >
                  Bahan yang sudah
                  terpakai
                </Text>
              </View>

              <Text
                style={
                  styles.chevron
                }
              >
                ›
              </Text>
            </Pressable>
          </View>

          {isHouseholdOwner ? (
            <>
              <Text style={styles.sectionTitle}>
                Pemulihan Owner
              </Text>

              <View style={styles.card}>
                <View style={styles.recoveryContent}>
                  <Text style={styles.menuTitle}>
                    Owner Recovery Code
                  </Text>

                  <Text style={styles.menuSubtitle}>
                    Buat kode pemulihan untuk membantu Owner
                    mendapatkan kembali akses ke kulkas bersama.
                  </Text>

                  {recoveryCode ? (
                    <View style={styles.recoveryCodeBox}>
                      <Text style={styles.recoveryCodeText}>
                        {recoveryCode}
                      </Text>
                    </View>
                  ) : null}

                  <Pressable
                    style={[
                      styles.recoveryButton,
                      generatingRecoveryCode &&
                        styles.logoutDisabled,
                    ]}
                    onPress={handleGenerateRecoveryCode}
                    disabled={generatingRecoveryCode || !householdId}
                  >
                    {generatingRecoveryCode ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.recoveryButtonText}>
                        {recoveryCode
                          ? 'Buat Recovery Code Baru'
                          : 'Generate Recovery Code'}
                      </Text>
                    )}
                  </Pressable>

                  <Text style={styles.recoveryHint}>
                    Simpan kode ini di tempat yang aman. Jika membuat
                    kode baru, kode sebelumnya tidak akan berlaku lagi.
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          <Text
            style={
              styles.sectionTitle
            }
          >
            Notifikasi
          </Text>

          <View
            style={styles.card}
          >
            <View
              style={
                styles.settingRow
              }
            >
              <View
                style={
                  styles.settingInfo
                }
              >
                <Text
                  style={
                    styles.menuTitle
                  }
                >
                  Notifikasi
                </Text>

                <Text
                  style={
                    styles.menuSubtitle
                  }
                >
                  Izinkan notifikasi dari
                  IsiKulkas
                </Text>
              </View>

              <Switch
                value={
                  notificationEnabled
                }
                onValueChange={
                  handleNotificationToggle
                }
                trackColor={{
                  false: '#DCE0DC',
                  true: '#84B7A1',
                }}
                thumbColor={
                  notificationEnabled
                    ? '#15956E'
                    : '#FFFFFF'
                }
              />
            </View>

            <View
              style={styles.divider}
            />

            <View
              style={
                styles.settingRow
              }
            >
              <View
                style={
                  styles.settingInfo
                }
              >
                <Text
                  style={
                    styles.menuTitle
                  }
                >
                  Pengingat kadaluarsa
                </Text>

                <Text
                  style={
                    styles.menuSubtitle
                  }
                >
                  Ingatkan bahan yang
                  segera kadaluarsa
                </Text>
              </View>

              <Switch
                value={
                  expiryReminderEnabled
                }
                onValueChange={
                  handleExpiryToggle
                }
                trackColor={{
                  false: '#DCE0DC',
                  true: '#84B7A1',
                }}
                thumbColor={
                  expiryReminderEnabled
                    ? '#15956E'
                    : '#FFFFFF'
                }
              />
            </View>
          </View>

          <Text
            style={styles.sectionTitle}
          >
            Keanggotaan
          </Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.menuTitle}>
                  Premium Membership
                </Text>

                <Text style={styles.menuSubtitle}>
                  Aktifkan fitur AI IsiKulkas
                </Text>
              </View>

              <Switch
                value={premiumEnabled}
                onValueChange={handlePremiumToggle}
                disabled={premiumSaving || !householdId}
                trackColor={{
                  false: '#DCE0DC',
                  true: '#84B7A1',
                }}
                thumbColor={
                  premiumEnabled ? '#15956E' : '#FFFFFF'
                }
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.menuTitle}>
                  {premiumEnabled ? 'Premium Active' : 'Free Plan'}
                </Text>

                <Text style={styles.menuSubtitle}>
                  {premiumEnabled
                    ? 'AI Shelf-Life & Usage Priority unlocked'
                    : 'Aktifkan Premium untuk mencoba fitur AI'}
                </Text>
              </View>

              {premiumSaving ? (
                <ActivityIndicator color="#2F7556" />
              ) : (
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: '700',
                    color: premiumEnabled ? '#15956E' : '#939A94',
                  }}
                >
                  {premiumEnabled ? 'PREMIUM' : 'FREE'}
                </Text>
              )}
            </View>
          </View>

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

          <Text
            style={
              styles.sectionTitle
            }
          >
            Sesi
          </Text>

          <View
            style={styles.warningBox}
          >
            <Text
              style={
                styles.warningTitle
              }
            >
              Perhatian
            </Text>

            <Text
              style={
                styles.warningText
              }
            >
              IsiKulkas saat ini
              menggunakan akun anonim.
              Setelah keluar, sesi ini
              tidak dapat dipulihkan.
              Kamu harus bergabung lagi
              menggunakan kode undangan.
            </Text>
          </View>

          <Pressable
            style={[
              styles.logoutButton,
              signingOut &&
                styles.logoutDisabled,
            ]}
            onPress={
              handleLogout
            }
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator
                color="#D45B49"
              />
            ) : (
              <Text
                style={
                  styles.logoutText
                }
              >
                Keluar dari Perangkat
              </Text>
            )}
          </Pressable>
        </ScrollView>

        <View
          style={styles.bottomNav}
        >
          <Pressable
            style={styles.navItem}
            onPress={() =>
              router.push('/')
            }
          >
            <Text
              style={styles.navIcon}
            >
              ⌂
            </Text>

            <Text
              style={styles.navText}
            >
              Beranda
            </Text>
          </Pressable>

          <Pressable
            style={styles.navItem}
            onPress={() =>
              router.push('/fridge')
            }
          >
            <Text
              style={styles.navIcon}
            >
              ▣
            </Text>

            <Text
              style={styles.navText}
            >
              Kulkas
            </Text>
          </Pressable>

          <Pressable
            style={styles.navItem}
          >
            <Text
              style={
                styles.activeNavIcon
              }
            >
              ⚙
            </Text>

            <Text
              style={
                styles.activeNavText
              }
            >
              Pengaturan
            </Text>
          </Pressable>
        </View>
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

    scroll: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 30,
    },

    title: {
      fontSize: 25,
      fontWeight: '700',
      color: '#222722',
    },

    subtitle: {
      fontSize: 11,
      color: '#8B928C',
      marginTop: 4,
      marginBottom: 20,
    },

    profileCard: {
      minHeight: 76,
      backgroundColor: '#388560',
      borderRadius: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 25,
    },

    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor:
        'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    avatarText: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    profileInfo: {
      flex: 1,
    },

    profileName: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    householdText: {
      fontSize: 9,
      color:
        'rgba(255,255,255,0.78)',
      marginTop: 3,
    },

    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: '#626A63',
      marginBottom: 7,
      marginTop: 2,
    },

    card: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E1E5E1',
      borderRadius: 13,
      marginBottom: 24,
      overflow: 'hidden',
    },

    menuRow: {
      minHeight: 66,
      paddingHorizontal: 13,
      flexDirection: 'row',
      alignItems: 'center',
    },

    menuIcon: {
      width: 34,
      height: 34,
      borderRadius: 9,
      backgroundColor: '#EAF3ED',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 11,
    },

    menuInfo: {
      flex: 1,
    },

    settingInfo: {
      flex: 1,
      paddingRight: 12,
    },

    menuTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: '#353B36',
    },

    menuSubtitle: {
      fontSize: 8.5,
      color: '#939A94',
      marginTop: 3,
    },

    chevron: {
      fontSize: 25,
      color: '#879087',
    },

    divider: {
      height: 1,
      backgroundColor: '#EEF0EE',
      marginHorizontal: 13,
    },

    settingRow: {
      minHeight: 69,
      paddingHorizontal: 13,
      flexDirection: 'row',
      alignItems: 'center',
    },

    recoveryContent: {
      padding: 14,
    },

    recoveryCodeBox: {
      backgroundColor: '#F1F6F2',
      borderWidth: 1,
      borderColor: '#DCE9DF',
      borderRadius: 9,
      paddingVertical: 13,
      paddingHorizontal: 10,
      marginTop: 13,
      alignItems: 'center',
    },

    recoveryCodeText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#2F7556',
      letterSpacing: 1,
      textAlign: 'center',
    },

    recoveryButton: {
      minHeight: 42,
      borderRadius: 9,
      backgroundColor: '#2F7556',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      marginTop: 13,
    },

    recoveryButtonText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    recoveryHint: {
      fontSize: 8.5,
      lineHeight: 13,
      color: '#858E87',
      marginTop: 9,
    },

    errorBox: {
      backgroundColor: '#FCEAE7',
      borderRadius: 10,
      padding: 11,
      marginTop: -12,
      marginBottom: 20,
    },

    errorText: {
      fontSize: 10,
      lineHeight: 15,
      color: '#B95242',
    },

    warningBox: {
      backgroundColor: '#FFF3E4',
      borderRadius: 12,
      padding: 13,
      marginBottom: 12,
    },

    warningTitle: {
      fontSize: 10,
      fontWeight: '700',
      color: '#B26C24',
    },

    warningText: {
      fontSize: 8.5,
      lineHeight: 14,
      color: '#93672E',
      marginTop: 4,
    },

    logoutButton: {
      height: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E9B4AA',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },

    logoutDisabled: {
      opacity: 0.55,
    },

    logoutText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#D15242',
    },

    bottomNav: {
      height: 82,
      borderTopWidth: 1,
      borderTopColor: '#EFF1EF',
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-around',
      paddingBottom: 8,
    },

    navItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    navIcon: {
      fontSize: 21,
      color: '#9AA39C',
      marginBottom: 4,
    },

    navText: {
      fontSize: 10,
      color: '#9AA39C',
    },

    activeNavIcon: {
      fontSize: 21,
      color: '#2F7556',
      marginBottom: 4,
    },

    activeNavText: {
      fontSize: 10,
      color: '#2F7556',
      fontWeight: '700',
    },

    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    loadingText: {
      fontSize: 10,
      color: '#8A918B',
      marginTop: 9,
    },
  });