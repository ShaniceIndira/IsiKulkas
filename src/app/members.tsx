
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import {
  router,
  useFocusEffect,
} from 'expo-router';
import {
  useCallback,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
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
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  const [currentUserId, setCurrentUserId] = useState('');
  const [activeHouseholdId, setActiveHouseholdId] = useState('');

  const [recoveryCode, setRecoveryCode] = useState('');
  const [generatingRecovery, setGeneratingRecovery] = useState(false);

  const [removingUserId, setRemovingUserId] = useState('');

  const [errorMessage, setErrorMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadHousehold();
    }, [])
  );

  // GET HOUSEHOLD ID
  async function getHouseholdId(
    userId: string
  ): Promise<string | null> {
    const saved = await AsyncStorage.getItem(
      'activeHouseholdId'
    );

    if (saved) {
      return saved;
    }

    const {
      data: membership,
      error,
    } = await supabase
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

  // LOAD HOUSEHOLD AND MEMBERS
  async function loadHousehold() {
    try {
      setLoading(true);
      setErrorMessage('');
      setCopied(false);

      // Recovery code hanya ditampilkan
      // setelah berhasil dibuat pada sesi halaman ini.
      setRecoveryCode('');
      setRecoveryCopied(false);

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
        setErrorMessage(
          'Kulkas aktif tidak ditemukan.'
        );
        return;
      }

      setActiveHouseholdId(householdId);

      // Household information
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

      // Household members
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

      setMembers((memberData || []) as Member[]);

    } catch (error) {
      console.error('Load members error:', error);
      setErrorMessage('Gagal memuat anggota.');
    } finally {
      setLoading(false);
    }
  }

  // CHECK OWNER STATUS
  const currentUserIsOwner = members.some(
    (member) =>
      member.user_id === currentUserId &&
      member.role === 'owner'
  );

  // DISPLAY NAME
  function getDisplayName(member: Member) {
    if (
      member.full_name &&
      member.full_name.trim()
    ) {
      return member.full_name;
    }

    if (member.user_id === currentUserId) {
      return 'Kamu';
    }

    return 'Anggota';
  }

  // COPY INVITE CODE
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
    }
  }

  // GENERATE OWNER RECOVERY CODE
  async function generateRecoveryCode() {
    if (!activeHouseholdId || !currentUserIsOwner) {
      Alert.alert(
        'Tidak diizinkan',
        'Hanya Owner yang dapat membuat Recovery Code.'
      );
      return;
    }

    try {
      setGeneratingRecovery(true);
      setRecoveryCode('');
      setRecoveryCopied(false);

      const {
        data,
        error,
      } = await supabase.rpc(
        'generate_owner_recovery_code',
        {
          p_household_id: activeHouseholdId,
        }
      );

      if (error) {
        console.error(
          'Generate recovery code error:',
          error
        );

        Alert.alert(
          'Gagal membuat Recovery Code',
          error.message
        );

        return;
      }

      if (!data || typeof data !== 'string') {
        Alert.alert(
          'Gagal',
          'Recovery Code tidak berhasil dibuat.'
        );
        return;
      }

      setRecoveryCode(data);

      Alert.alert(
        'Recovery Code berhasil dibuat',
        'Simpan kode ini di tempat yang aman. Kode hanya ditampilkan setelah dibuat dan diperlukan untuk memulihkan kepemilikan kulkas.'
      );

    } catch (error) {
      console.error(
        'Generate recovery code error:',
        error
      );

      Alert.alert(
        'Terjadi kesalahan',
        'Gagal membuat Recovery Code. Coba lagi.'
      );

    } finally {
      setGeneratingRecovery(false);
    }
  }

  // CONFIRM GENERATING RECOVERY CODE
  function confirmGenerateRecoveryCode() {
    Alert.alert(
      'Buat Recovery Code?',
      'Jika sebelumnya sudah ada Recovery Code, kode lama akan digantikan dan tidak bisa digunakan lagi. Lanjutkan?',
      [
        {
          text: 'Batal',
          style: 'cancel',
        },
        {
          text: 'Buat Kode',
          onPress: () => {
            void generateRecoveryCode();
          },
        },
      ]
    );
  }

  // COPY RECOVERY CODE
  async function copyRecoveryCode() {
    if (!recoveryCode) return;

    try {
      await Clipboard.setStringAsync(recoveryCode);

      setRecoveryCopied(true);

      setTimeout(() => {
        setRecoveryCopied(false);
      }, 1500);

    } catch (error) {
      console.error(
        'Copy recovery code error:',
        error
      );

      Alert.alert(
        'Gagal',
        'Recovery Code tidak berhasil disalin.'
      );
    }
  }

  // REMOVE MEMBER
  async function handleRemoveMember(member: Member) {
    if (!activeHouseholdId) {
      Alert.alert(
        'Gagal',
        'Kulkas aktif tidak ditemukan.'
      );
      return;
    }

    if (
      member.role !== 'member' ||
      member.user_id === currentUserId
    ) {
      Alert.alert(
        'Tidak dapat menghapus anggota',
        'Hanya anggota dengan role Member yang dapat dikeluarkan.'
      );
      return;
    }

    try {
      setRemovingUserId(member.user_id);

      const { error } = await supabase.rpc(
        'remove_household_member',
        {
          target_household_id: activeHouseholdId,
          target_user_id: member.user_id,
        }
      );

      if (error) {
        console.error('Remove member error:', error);

        Alert.alert(
          'Gagal mengeluarkan anggota',
          error.message ||
            'Terjadi kesalahan. Silakan coba lagi.'
        );

        return;
      }

      setMembers((currentMembers) =>
        currentMembers.filter(
          (currentMember) =>
            currentMember.user_id !== member.user_id
        )
      );

      Alert.alert(
        'Berhasil',
        `${getDisplayName(member)} sudah dikeluarkan dari ${householdName}.`
      );

    } catch (error) {
      console.error('Remove member error:', error);

      Alert.alert(
        'Gagal mengeluarkan anggota',
        'Terjadi kesalahan. Silakan coba lagi.'
      );

    } finally {
      setRemovingUserId('');
    }
  }

  // CONFIRM REMOVE MEMBER
  function confirmRemoveMember(member: Member) {
    const displayName = getDisplayName(member);

    Alert.alert(
      'Keluarkan anggota?',
      `${displayName} akan dikeluarkan dari ${householdName}. Anggota tersebut tidak lagi dapat mengakses kulkas bersama.`,
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
              <Text style={styles.backText}>
                ‹
              </Text>
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

              {/* INVITATION CODE */}
              <Text style={styles.sectionTitle}>
                Undang anggota
              </Text>

              <View style={styles.inviteCard}>
                <Text style={styles.inviteLabel}>
                  Kode undangan
                </Text>

                <Text style={styles.inviteCode}>
                  {inviteCode || '-'}
                </Text>

                <Text style={styles.inviteHelp}>
                  Kirim kode ini ke orang yang ingin kamu ajak mengelola kulkas.
                </Text>

                <Pressable
                  style={styles.copyButton}
                  onPress={copyInviteCode}
                >
                  <Text style={styles.copyButtonText}>
                    {copied ? '✓ Disalin' : 'Salin Kode'}
                  </Text>
                </Pressable>
              </View>

              {/* OWNER RECOVERY CODE */}
              {currentUserIsOwner && (
                <>
                  <Text style={styles.sectionTitle}>
                    Pemulihan Owner
                  </Text>

                  <View style={styles.recoveryCard}>
                    <View style={styles.recoveryIcon}>
                      <Text style={styles.recoveryIconText}>
                        🔐
                      </Text>
                    </View>

                    <Text style={styles.recoveryTitle}>
                      Recovery Code
                    </Text>

                    <Text style={styles.recoveryDescription}>
                      Buat kode pemulihan untuk mengembalikan kepemilikan kulkas jika kamu perlu masuk kembali sebagai Owner.
                    </Text>

                    {recoveryCode ? (
                      <>
                        <View style={styles.recoveryCodeBox}>
                          <Text
                            selectable
                            style={styles.recoveryCodeText}
                          >
                            {recoveryCode}
                          </Text>
                        </View>

                        <Pressable
                          style={styles.recoveryButton}
                          onPress={copyRecoveryCode}
                        >
                          <Text style={styles.recoveryButtonText}>
                            {recoveryCopied
                              ? '✓ Recovery Code Disalin'
                              : 'Salin Recovery Code'}
                          </Text>
                        </Pressable>

                        <Text style={styles.recoveryWarning}>
                          Simpan kode ini sekarang. Jangan bagikan kepada orang lain.
                        </Text>

                        <Pressable
                          style={styles.newRecoveryButton}
                          onPress={confirmGenerateRecoveryCode}
                          disabled={generatingRecovery}
                        >
                          <Text style={styles.newRecoveryText}>
                            Buat Recovery Code Baru
                          </Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        style={[
                          styles.recoveryButton,
                          generatingRecovery &&
                            styles.disabledButton,
                        ]}
                        onPress={confirmGenerateRecoveryCode}
                        disabled={generatingRecovery}
                      >
                        {generatingRecovery ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.recoveryButtonText}>
                            Buat Recovery Code →
                          </Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                </>
              )}

              {/* MEMBERS LIST */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Anggota kulkas
                </Text>

                <Text style={styles.memberCount}>
                  {members.length}
                </Text>
              </View>

              {members.map((member) => {
                const displayName = getDisplayName(member);

                return (
                  <View
                    key={member.membership_id}
                    style={styles.memberCard}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {displayName.charAt(0).toUpperCase()}
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

                    {/* REMOVE MEMBER */}
                    {currentUserIsOwner &&
                    member.role === 'member' &&
                    member.user_id !== currentUserId ? (
                      <Pressable
                        style={[
                          styles.removeButton,
                          removingUserId === member.user_id &&
                            styles.removeButtonDisabled,
                        ]}
                        onPress={() => confirmRemoveMember(member)}
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

              {/* INFORMATION */}
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>
                  Semua tersinkron
                </Text>

                <Text style={styles.infoText}>
                  Anggota dalam kulkas yang sama dapat melihat dan mengelola isi kulkas bersama.
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

  // RECOVERY CODE STYLES
  recoveryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    marginBottom: 26,
  },

  recoveryIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E7F2EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  recoveryIconText: {
    fontSize: 20,
  },

  recoveryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#252A25',
  },

  recoveryDescription: {
    fontSize: 10,
    lineHeight: 16,
    color: '#858C86',
    marginTop: 6,
    marginBottom: 14,
  },

  recoveryCodeBox: {
    backgroundColor: '#F0F6F2',
    borderWidth: 1,
    borderColor: '#DCE9DF',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 12,
  },

  recoveryCodeText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2F7556',
    letterSpacing: 1,
    textAlign: 'center',
  },

  recoveryButton: {
    height: 46,
    backgroundColor: '#2F7556',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  recoveryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  recoveryWarning: {
    fontSize: 10,
    lineHeight: 15,
    color: '#A16B36',
    marginTop: 10,
  },

  newRecoveryButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },

  newRecoveryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6F786F',
  },

  disabledButton: {
    opacity: 0.6,
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
