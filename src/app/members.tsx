
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';

type Member = {
  membership_id: string;
  user_id: string;
  role: 'owner' | 'member';
  full_name: string | null;
  joined_at?: string | null;
};

export default function MembersScreen() {
  const [loading, setLoading] = useState(true);
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [copied, setCopied] = useState(false);

  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  const [currentUserId, setCurrentUserId] = useState('');
  const [activeHouseholdId, setActiveHouseholdId] = useState('');
  const [removingUserId, setRemovingUserId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      void loadHousehold();
    }, [])
  );

  // PESAN UNTUK WEB, ANDROID, DAN IOS
  function showMessage(title: string, message: string) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  // AMBIL HOUSEHOLD ID
  async function getHouseholdId(
    userId: string
  ): Promise<string | null> {
    const saved = await AsyncStorage.getItem(
      'activeHouseholdId'
    );

    if (saved) {
      return saved;
    }

    const { data: membership, error } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Membership error:', error);
      return null;
    }

    const householdId = membership?.household_id;

    if (!householdId) {
      return null;
    }

    await AsyncStorage.setItem(
      'activeHouseholdId',
      householdId
    );

    return householdId;
  }

  // LOAD HOUSEHOLD DAN ANGGOTA
  async function loadHousehold() {
    try {
      setLoading(true);
      setErrorMessage('');
      setCopied(false);
      setRecoveryCode('');
      setRecoveryCopied(false);
      setRecoveryError('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace('/auth');
        return;
      }

      setCurrentUserId(user.id);

      const householdId = await getHouseholdId(user.id);

      if (!householdId) {
        setErrorMessage('Kulkas aktif tidak ditemukan.');
        return;
      }

      setActiveHouseholdId(householdId);

      const {
        data: household,
        error: householdError,
      } = await supabase
        .from('households')
        .select('name, invite_code')
        .eq('id', householdId)
        .single();

      if (householdError) {
        console.error('Household error:', householdError);
        setErrorMessage(householdError.message);
        return;
      }

      setHouseholdName(
        household?.name || 'Kulkas Saya'
      );

      setInviteCode(
        household?.invite_code || ''
      );

      const {
        data: memberData,
        error: membersError,
      } = await supabase.rpc(
        'get_household_members',
        {
          target_household_id: householdId,
        }
      );

      if (membersError) {
        console.error('Members RPC error:', membersError);
        setErrorMessage(membersError.message);
        return;
      }

      const loadedMembers = (memberData || []) as Member[];
      setMembers(loadedMembers);

      // KODE PEMULIHAN HANYA UNTUK OWNER
      const isOwner = loadedMembers.some(
        (member) =>
          member.user_id === user.id &&
          member.role === 'owner'
      );

      if (isOwner) {
        await loadRecoveryCode(householdId);
      }
    } catch (error) {
      console.error('Load members error:', error);
      setErrorMessage('Gagal memuat anggota.');
    } finally {
      setLoading(false);
    }
  }

  // STATUS OWNER
  const currentUserIsOwner = members.some(
    (member) =>
      member.user_id === currentUserId &&
      member.role === 'owner'
  );

  // NAMA ANGGOTA
  function getDisplayName(member: Member) {
    if (member.full_name && member.full_name.trim()) {
      return member.full_name;
    }

    if (member.user_id === currentUserId) {
      return 'Kamu';
    }

    return 'Anggota';
  }

  // SALIN KODE UNDANGAN
  async function copyInviteCode() {
    if (!inviteCode) return;

    try {
      await Clipboard.setStringAsync(inviteCode);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.error('Copy invite code error:', error);
      showMessage(
        'Gagal',
        'Kode undangan tidak berhasil disalin.'
      );
    }
  }

  // AMBIL KODE PEMULIHAN PERMANEN
  async function loadRecoveryCode(householdId: string) {
    if (!householdId) return;

    try {
      setRecoveryLoading(true);
      setRecoveryError('');

      const { data, error } = await supabase.rpc(
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
          'Kode pemulihan tidak tersedia.'
        );
      }

      setRecoveryCode(data);
    } catch (error) {
      console.error(
        'Load owner recovery error:',
        error
      );

      setRecoveryCode('');
      setRecoveryError(
        error instanceof Error
          ? error.message
          : 'Gagal memuat kode pemulihan Owner.'
      );
    } finally {
      setRecoveryLoading(false);
    }
  }

  // SALIN KODE PEMULIHAN OWNER
  async function copyRecoveryCode() {
    if (!currentUserIsOwner || !recoveryCode) {
      return;
    }

    try {
      await Clipboard.setStringAsync(recoveryCode);
      setRecoveryCopied(true);

      setTimeout(() => {
        setRecoveryCopied(false);
      }, 1500);
    } catch (error) {
      console.error(
        'Copy owner recovery error:',
        error
      );

      showMessage(
        'Gagal',
        'Kode pemulihan tidak berhasil disalin.'
      );
    }
  }

  // HAPUS ANGGOTA DARI SUPABASE
  async function handleRemoveMember(member: Member) {
    if (!currentUserIsOwner) {
      showMessage(
        'Tidak diizinkan',
        'Hanya Owner yang dapat menghapus anggota.'
      );
      return;
    }

    if (!activeHouseholdId) {
      showMessage(
        'Gagal',
        'Kulkas aktif tidak ditemukan.'
      );
      return;
    }

    if (
      member.role !== 'member' ||
      member.user_id === currentUserId
    ) {
      showMessage(
        'Tidak dapat menghapus anggota',
        'Hanya pengguna dengan role Member yang dapat dikeluarkan.'
      );
      return;
    }

    if (removingUserId) return;

    try {
      setRemovingUserId(member.user_id);

      // PANGGIL RPC SUPABASE
      const { error } = await supabase.rpc(
        'remove_household_member',
        {
          target_household_id: activeHouseholdId,
          target_user_id: member.user_id,
        }
      );

      if (error) {
        throw error;
      }

      // MUAT ULANG ANGGOTA DARI DATABASE
      const {
        data: updatedMembers,
        error: reloadError,
      } = await supabase.rpc(
        'get_household_members',
        {
          target_household_id: activeHouseholdId,
        }
      );

      if (reloadError) {
        console.warn(
          'Reload members after removal:',
          reloadError
        );

        setMembers((prev) =>
          prev.filter(
            (m) => m.user_id !== member.user_id
          )
        );
      } else {
        setMembers(
          (updatedMembers || []) as Member[]
        );
      }

      showMessage(
        'Berhasil',
        `${getDisplayName(member)} sudah dikeluarkan dari ${householdName}.`
      );
    } catch (error) {
      console.error(
        'Remove member error:',
        error
      );

      showMessage(
        'Gagal mengeluarkan anggota',
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan. Silakan coba lagi.'
      );
    } finally {
      setRemovingUserId('');
    }
  }

  // KONFIRMASI HAPUS ANGGOTA
  function confirmRemoveMember(member: Member) {
    if (!currentUserIsOwner || removingUserId) {
      return;
    }

    const displayName = getDisplayName(member);

    const message =
      `${displayName} akan dikeluarkan dari ${householdName}. ` +
      'Anggota tersebut tidak lagi dapat mengakses kulkas bersama.';

    // KONFIRMASI UNTUK LOCALHOST / WEB
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Keluarkan anggota?\n\n${message}`
      );

      if (confirmed) {
        void handleRemoveMember(member);
      }

      return;
    }

    // KONFIRMASI UNTUK ANDROID / IOS
    Alert.alert(
      'Keluarkan anggota?',
      message,
      [
        {
          text: 'Batal',
          style: 'cancel',
        },
        {
          text: 'Keluarkan',
          style: 'destructive',
          onPress: () => {
            void handleRemoveMember(member);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.phone}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <Pressable
              style={styles.backButton}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/settings');
                }
              }}
            >
              <Text style={styles.backText}>‹</Text>
            </Pressable>

            <Text style={styles.title}>
              Anggota
            </Text>

            <View style={styles.headerSpacer} />
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#2F7556" />

              <Text style={styles.loadingText}>
                Memuat anggota...
              </Text>
            </View>
          ) : (
            <>
              {/* ERROR */}
              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {/* HOUSEHOLD */}
              <View style={styles.householdCard}>
                <Text style={styles.householdLabel}>
                  Kulkas bersama
                </Text>

                <Text style={styles.householdName}>
                  {householdName}
                </Text>
              </View>

              {/* KODE UNDANGAN */}
              <Text style={styles.sectionTitle}>
                Undang anggota
              </Text>

              <View style={styles.inviteCard}>
                <Text style={styles.inviteLabel}>
                  Kode undangan
                </Text>

                <Text
                  style={styles.inviteCode}
                  selectable
                >
                  {inviteCode || '-'}
                </Text>

                <Text style={styles.inviteHelp}>
                  Kirim kode ini ke orang yang ingin kamu
                  ajak mengelola kulkas.
                </Text>

                <Pressable
                  style={styles.copyButton}
                  onPress={copyInviteCode}
                >
                  <Text style={styles.copyButtonText}>
                    {copied
                      ? '✓ Disalin'
                      : 'Salin Kode'}
                  </Text>
                </Pressable>
              </View>

              {/* KODE PEMULIHAN OWNER */}
              {currentUserIsOwner ? (
                <>
                  <Text style={styles.sectionTitle}>
                    Pemulihan Owner
                  </Text>

                  <View style={styles.recoveryCard}>
                    <Text style={styles.recoveryLabel}>
                      Kode pemulihan Owner
                    </Text>

                    {recoveryLoading ? (
                      <View style={styles.recoveryLoadingRow}>
                        <ActivityIndicator
                          color="#2F7556"
                          size="small"
                        />

                        <Text style={styles.recoveryHelp}>
                          Memuat kode pemulihan...
                        </Text>
                      </View>
                    ) : recoveryCode ? (
                      <>
                        <Text
                          style={[
                            styles.recoveryHidden,
                            styles.recoveryVisible,
                          ]}
                          selectable
                        >
                          {recoveryCode}
                        </Text>

                        <Text style={styles.recoveryHelp}>
                          Kode ini tetap sama setiap kali
                          halaman dibuka. Simpan secara
                          rahasia karena dapat digunakan
                          untuk memulihkan kepemilikan
                          kulkas.
                        </Text>

                        <Pressable
                          style={styles.recoveryManageButton}
                          onPress={() => {
                            void copyRecoveryCode();
                          }}
                        >
                          <Text style={styles.recoveryManageText}>
                            {recoveryCopied
                              ? '✓ Disalin'
                              : 'Salin Kode'}
                          </Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Text style={styles.recoveryHelp}>
                          {recoveryError ||
                            'Kode pemulihan belum tersedia.'}
                        </Text>

                        <Pressable
                          style={styles.recoveryManageButton}
                          onPress={() => {
                            void loadRecoveryCode(
                              activeHouseholdId
                            );
                          }}
                          disabled={!activeHouseholdId}
                        >
                          <Text style={styles.recoveryManageText}>
                            Coba Muat Ulang
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </>
              ) : null}

              {/* DAFTAR ANGGOTA */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Anggota kulkas
                </Text>

                <Text style={styles.memberCount}>
                  {members.length}
                </Text>
              </View>

              {members.map((member) => {
                const displayName =
                  getDisplayName(member);

                return (
                  <View
                    key={member.membership_id}
                    style={styles.memberCard}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {displayName
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>
                        {displayName}
                        {member.user_id === currentUserId
                          ? ' (Kamu)'
                          : ''}
                      </Text>

                      <Text style={styles.memberRole}>
                        {member.role === 'owner'
                          ? 'Pemilik kulkas'
                          : 'Anggota'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.roleBadge,
                        member.role === 'owner'
                          ? styles.ownerBadge
                          : styles.memberBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleText,
                          member.role === 'owner'
                            ? styles.ownerText
                            : styles.memberText,
                        ]}
                      >
                        {member.role === 'owner'
                          ? 'Owner'
                          : 'Member'}
                      </Text>
                    </View>

                    {/* TOMBOL HAPUS */}
                    {currentUserIsOwner &&
                    member.role === 'member' &&
                    member.user_id !== currentUserId ? (
                      <Pressable
                        style={[
                          styles.removeButton,
                          removingUserId === member.user_id &&
                            styles.removeButtonDisabled,
                        ]}
                        onPress={() => {
                          confirmRemoveMember(member);
                        }}
                        disabled={removingUserId !== ''}
                      >
                        {removingUserId === member.user_id ? (
                          <ActivityIndicator
                            size="small"
                            color="#B95242"
                          />
                        ) : (
                          <Text style={styles.removeButtonText}>
                            Hapus
                          </Text>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}

              {/* INFORMASI */}
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>
                  Semua tersinkron
                </Text>

                <Text style={styles.infoText}>
                  Anggota dalam kulkas yang sama dapat
                  melihat dan mengelola isi kulkas bersama.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// STYLES
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
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
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
  },

  backText: {
    fontSize: 28,
    lineHeight: 30,
    color: '#515952',
  },

  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222722',
  },

  headerSpacer: {
    width: 38,
  },

  loadingBox: {
    paddingVertical: 80,
    alignItems: 'center',
  },

  loadingText: {
    fontSize: 11,
    color: '#8A918B',
    marginTop: 10,
  },

  errorBox: {
    backgroundColor: '#FCEAE7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },

  errorText: {
    fontSize: 10,
    color: '#B95242',
  },

  householdCard: {
    backgroundColor: '#367A5A',
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
  },

  householdLabel: {
    fontSize: 10,
    color: '#DDEBE3',
  },

  householdName: {
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#252A25',
  },

  inviteCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    marginBottom: 26,
  },

  inviteLabel: {
    fontSize: 10,
    color: '#8A918B',
  },

  inviteCode: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2F7556',
    letterSpacing: 1,
    marginTop: 5,
  },

  inviteHelp: {
    fontSize: 10,
    lineHeight: 15,
    color: '#8A918B',
    marginTop: 7,
    marginBottom: 14,
  },

  copyButton: {
    height: 44,
    borderRadius: 9,
    backgroundColor: '#E7F2EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  copyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2F7556',
  },

  // RECOVERY CODE
  recoveryLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },

  recoveryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    marginBottom: 26,
  },

  recoveryLabel: {
    fontSize: 10,
    color: '#8A918B',
  },

  recoveryHidden: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2F7556',
    letterSpacing: 1,
    marginTop: 5,
  },

  recoveryVisible: {
    fontSize: 16,
    letterSpacing: 0.5,
  },

  recoveryHelp: {
    fontSize: 10,
    lineHeight: 16,
    color: '#8A918B',
    marginTop: 7,
    marginBottom: 14,
  },

  recoveryManageButton: {
    height: 44,
    borderRadius: 9,
    backgroundColor: '#E7F2EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  recoveryManageText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2F7556',
  },

  // MEMBERS
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  memberCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A918B',
  },

  memberCard: {
    minHeight: 64,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E6E2',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 9,
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E5F1EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2F7556',
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#252A25',
  },

  memberRole: {
    fontSize: 10,
    color: '#8A918B',
    marginTop: 3,
  },

  roleBadge: {
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  ownerBadge: {
    backgroundColor: '#E7F2EB',
  },

  memberBadge: {
    backgroundColor: '#EEF0EE',
  },

  roleText: {
    fontSize: 9,
    fontWeight: '700',
  },

  ownerText: {
    color: '#2F7556',
  },

  memberText: {
    color: '#6F776F',
  },

  // REMOVE BUTTON
  removeButton: {
    minWidth: 58,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FCEAE7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    marginLeft: 8,
  },

  removeButtonDisabled: {
    opacity: 0.55,
  },

  removeButtonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B95242',
  },

  infoCard: {
    backgroundColor: '#F0F6F2',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
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
});
