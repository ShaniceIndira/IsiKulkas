import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  router,
  useFocusEffect,
} from 'expo-router';
import {
  useCallback,
  useRef,
  useState,
} from 'react';
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

type HistoryItem = {
  id: string;
  household_id: string;
  name: string;
  quantity?: string | null;
  category?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  status:
    | 'active'
    | 'used'
    | 'expired'
    | 'discarded';
  used_at?: string | null;
};

function getCategoryIcon(
  category?: string | null
) {
  switch (category) {
    case 'Daging':
      return '🥩';

    case 'Sayur':
      return '🥬';

    case 'Buah':
      return '🍎';

    case 'Susu':
      return '🥛';

    case 'Cairan':
      return '💧';

    default:
      return '🛒';
  }
}

function formatUsedAt(
  value?: string | null
) {
  if (!value) {
    return 'Waktu tidak tersedia';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Waktu tidak tersedia';
  }

  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryScreen() {
  const [items, setItems] =
    useState<HistoryItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const householdIdRef =
    useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      let realtimeChannel:
        | ReturnType<
            typeof supabase.channel
          >
        | null = null;

      async function setupHistory() {
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

          const householdId =
            await getHouseholdId(
              user.id
            );

          if (
            !householdId ||
            !isMounted
          ) {
            if (isMounted) {
              setErrorMessage(
                'Kulkas aktif tidak ditemukan.'
              );

              setLoading(false);
            }

            return;
          }

          householdIdRef.current =
            householdId;

          await loadHistory(
            householdId,
            isMounted
          );

          if (!isMounted) {
            return;
          }

          realtimeChannel =
            supabase
              .channel(
                `history-${householdId}`
              )
              .on(
                'postgres_changes',
                {
                  event: '*',
                  schema: 'public',
                  table:
                    'fridge_items',
                  filter:
                    `household_id=eq.${householdId}`,
                },
                async () => {
                  if (
                    householdIdRef.current ===
                    householdId
                  ) {
                    await loadHistory(
                      householdId,
                      true,
                      false
                    );
                  }
                }
              )
              .subscribe();
        } catch (error) {
          console.error(
            'Setup history error:',
            error
          );

          if (isMounted) {
            setErrorMessage(
              'Gagal memuat riwayat.'
            );

            setLoading(false);
          }
        }
      }

      setupHistory();

      return () => {
        isMounted = false;

        householdIdRef.current =
          null;

        if (realtimeChannel) {
          supabase.removeChannel(
            realtimeChannel
          );
        }
      };
    }, [])
  );

  async function getHouseholdId(
    userId: string
  ): Promise<string | null> {
    const saved =
      await AsyncStorage.getItem(
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
      console.error(
        'Membership error:',
        error
      );

      return null;
    }

    const householdId =
      membership?.household_id;

    if (!householdId) {
      return null;
    }

    await AsyncStorage.setItem(
      'activeHouseholdId',
      householdId
    );

    return householdId;
  }

  async function loadHistory(
    householdId: string,
    shouldUpdate = true,
    showLoading = true
  ) {
    try {
      if (
        showLoading &&
        shouldUpdate
      ) {
        setLoading(true);
      }

      const {
        data,
        error,
      } = await supabase
        .from('fridge_items')
        .select(
          'id, household_id, name, quantity, category, expiry_date, notes, status, used_at'
        )
        .eq(
          'household_id',
          householdId
        )
        .eq('status', 'used')
        .order('used_at', {
          ascending: false,
        });

      if (error) {
        console.error(
          'Load history error:',
          error
        );

        if (shouldUpdate) {
          setErrorMessage(
            error.message
          );
        }

        return;
      }

      if (shouldUpdate) {
        setItems(
          (data || []) as HistoryItem[]
        );
      }
    } catch (error) {
      console.error(
        'History load error:',
        error
      );

      if (shouldUpdate) {
        setErrorMessage(
          'Gagal memuat riwayat.'
        );
      }
    } finally {
      if (
        showLoading &&
        shouldUpdate
      ) {
        setLoading(false);
      }
    }
  }

  async function restoreItem(
    itemId: string
  ) {
    try {
      setErrorMessage('');

      const { error } =
        await supabase
          .from('fridge_items')
          .update({
            status: 'active',
            used_at: null,
          })
          .eq('id', itemId);

      if (error) {
        console.error(
          'Restore item error:',
          error
        );

        setErrorMessage(
          error.message
        );

        return;
      }

      setItems((current) =>
        current.filter(
          (item) =>
            item.id !== itemId
        )
      );
    } catch (error) {
      console.error(
        'Restore item error:',
        error
      );

      setErrorMessage(
        'Gagal mengembalikan bahan.'
      );
    }
  }

  async function deleteItem(
    itemId: string
  ) {
    try {
      setErrorMessage('');

      const { error } =
        await supabase
          .from('fridge_items')
          .delete()
          .eq('id', itemId);

      if (error) {
        console.error(
          'Delete history item error:',
          error
        );

        setErrorMessage(
          error.message
        );

        return;
      }

      setItems((current) =>
        current.filter(
          (item) =>
            item.id !== itemId
        )
      );
    } catch (error) {
      console.error(
        'Delete history error:',
        error
      );

      setErrorMessage(
        'Gagal menghapus riwayat.'
      );
    }
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View style={styles.phone}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={handleBack}
          >
            <Text
              style={styles.backText}
            >
              ‹
            </Text>
          </Pressable>

          <Text
            style={styles.title}
          >
            Riwayat
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        {loading ? (
          <View
            style={
              styles.centerContent
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
              Memuat riwayat...
            </Text>
          </View>
        ) : (
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
              style={styles.heading}
            >
              Bahan yang sudah terpakai
            </Text>

            <Text
              style={
                styles.description
              }
            >
              Semua anggota kulkas dapat
              melihat riwayat bahan yang
              sudah digunakan.
            </Text>

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

            {items.length === 0 ? (
              <View
                style={
                  styles.emptyCard
                }
              >
                <Text
                  style={
                    styles.emptyEmoji
                  }
                >
                  ✓
                </Text>

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  Belum ada riwayat
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Bahan yang ditandai
                  Sudah Terpakai akan
                  muncul di sini.
                </Text>
              </View>
            ) : (
              items.map((item) => (
                <View
                  key={item.id}
                  style={
                    styles.itemCard
                  }
                >
                  <View
                    style={
                      styles.itemTop
                    }
                  >
                    <View
                      style={
                        styles.foodIcon
                      }
                    >
                      <Text
                        style={
                          styles.foodEmoji
                        }
                      >
                        {getCategoryIcon(
                          item.category
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.itemInfo
                      }
                    >
                      <Text
                        style={
                          styles.itemName
                        }
                      >
                        {item.name}
                      </Text>

                      <Text
                        style={
                          styles.itemMeta
                        }
                      >
                        {item.quantity ||
                          'Jumlah tidak diisi'}
                        {' • '}
                        {item.category ||
                          'Lainnya'}
                      </Text>

                      <Text
                        style={
                          styles.usedAt
                        }
                      >
                        Digunakan{' '}
                        {formatUsedAt(
                          item.used_at
                        )}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.actionRow
                    }
                  >
                    <Pressable
                      style={
                        styles.restoreButton
                      }
                      onPress={() =>
                        restoreItem(
                          item.id
                        )
                      }
                    >
                      <Text
                        style={
                          styles.restoreButtonText
                        }
                      >
                        ↩ Kembalikan ke
                        Kulkas
                      </Text>
                    </Pressable>

                    <Pressable
                      style={
                        styles.deleteButton
                      }
                      onPress={() =>
                        deleteItem(
                          item.id
                        )
                      }
                    >
                      <Text
                        style={
                          styles.deleteText
                        }
                      >
                        ×
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}
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

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 18,
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

    scroll: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 24,
      paddingBottom: 40,
    },

    centerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    loadingText: {
      fontSize: 10,
      color: '#8A918B',
      marginTop: 9,
    },

    heading: {
      fontSize: 23,
      lineHeight: 29,
      fontWeight: '700',
      color: '#202520',
    },

    description: {
      fontSize: 11,
      lineHeight: 18,
      color: '#7F877F',
      marginTop: 7,
      marginBottom: 20,
    },

    errorBox: {
      backgroundColor: '#FCEAE7',
      borderRadius: 10,
      padding: 11,
      marginBottom: 12,
    },

    errorText: {
      color: '#B95242',
      fontSize: 10,
      lineHeight: 15,
    },

    emptyCard: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E1E5E1',
      borderRadius: 15,
      padding: 24,
      alignItems: 'center',
    },

    emptyEmoji: {
      fontSize: 34,
      marginBottom: 10,
    },

    emptyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#282D29',
    },

    emptyText: {
      fontSize: 10,
      lineHeight: 16,
      color: '#8A918B',
      textAlign: 'center',
      marginTop: 5,
    },

    itemCard: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E1E5E1',
      borderRadius: 14,
      padding: 14,
      marginBottom: 11,
    },

    itemTop: {
      flexDirection: 'row',
    },

    foodIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: '#F0F4F1',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 11,
    },

    foodEmoji: {
      fontSize: 21,
    },

    itemInfo: {
      flex: 1,
    },

    itemName: {
      fontSize: 14,
      fontWeight: '700',
      color: '#252A25',
    },

    itemMeta: {
      fontSize: 10,
      color: '#8A918B',
      marginTop: 4,
    },

    usedAt: {
      fontSize: 9,
      color: '#9AA19B',
      marginTop: 6,
    },

    actionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 13,
    },

    restoreButton: {
      flex: 1,
      height: 36,
      borderRadius: 8,
      backgroundColor: '#E6F2EA',
      alignItems: 'center',
      justifyContent: 'center',
    },

    restoreButtonText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#2F7556',
    },

    deleteButton: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: '#FBEAE7',
      alignItems: 'center',
      justifyContent: 'center',
    },

    deleteText: {
      color: '#CE5847',
      fontSize: 20,
      lineHeight: 21,
    },
  });