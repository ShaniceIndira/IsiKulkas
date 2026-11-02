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

type FridgeItem = {
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
  created_at?: string | null;
};

function parseISODate(
  value?: string | null
) {
  if (!value) {
    return null;
  }

  const parts = value.split('-');

  if (parts.length !== 3) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(
    year,
    month - 1,
    day
  );
}

function getDaysUntilExpiry(
  expiry?: string | null
) {
  const expiryDate =
    parseISODate(expiry);

  if (!expiryDate) {
    return null;
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);

  return Math.ceil(
    (expiryDate.getTime() -
      today.getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

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

function getExpiryText(
  expiry?: string | null
) {
  const days =
    getDaysUntilExpiry(expiry);

  if (days === null) {
    return 'Tanggal belum diisi';
  }

  if (days < 0) {
    return 'Sudah kadaluarsa';
  }

  if (days === 0) {
    return 'Kadaluarsa hari ini';
  }

  if (days === 1) {
    return 'Kadaluarsa besok';
  }

  return `Kadaluarsa dalam ${days} hari`;
}

export default function HomeScreen() {
  const [
    householdName,
    setHouseholdName,
  ] = useState('');

  const [items, setItems] =
    useState<FridgeItem[]>([]);

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

      async function setupHome() {
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
            await getActiveHouseholdId(
              user.id
            );

          if (
            !householdId ||
            !isMounted
          ) {
            if (isMounted) {
              router.replace(
                '/profile-setup'
              );
            }

            return;
          }

          householdIdRef.current =
            householdId;

          await loadHousehold(
            householdId,
            isMounted
          );

          await loadItems(
            householdId,
            isMounted
          );

          if (!isMounted) {
            return;
          }

          realtimeChannel =
            supabase
              .channel(
                `home-${householdId}`
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
                    await loadItems(
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
            'Setup home error:',
            error
          );

          if (isMounted) {
            setErrorMessage(
              'Gagal memuat beranda.'
            );

            setLoading(false);
          }
        }
      }

      setupHome();

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

  async function getActiveHouseholdId(
    userId: string
  ): Promise<string | null> {
    const savedHouseholdId =
      await AsyncStorage.getItem(
        'activeHouseholdId'
      );

    if (savedHouseholdId) {
      return savedHouseholdId;
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

  async function loadHousehold(
    householdId: string,
    shouldUpdate = true
  ) {
    const {
      data,
      error,
    } = await supabase
      .from('households')
      .select('name')
      .eq('id', householdId)
      .maybeSingle();

    if (error) {
      console.error(
        'Load household error:',
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
      setHouseholdName(
        data?.name ||
          'Kulkas Bersama'
      );
    }
  }

  async function loadItems(
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
        .select('*')
        .eq(
          'household_id',
          householdId
        )
        .eq('status', 'active')
        .order('created_at', {
          ascending: false,
        });

      if (error) {
        console.error(
          'Load home items error:',
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
          (data || []) as FridgeItem[]
        );
      }
    } catch (error) {
      console.error(
        'Load home items error:',
        error
      );

      if (shouldUpdate) {
        setErrorMessage(
          'Gagal memuat isi kulkas.'
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

  const urgentItems =
    items.filter((item) => {
      const days =
        getDaysUntilExpiry(
          item.expiry_date
        );

      return (
        days !== null &&
        days >= 0 &&
        days <= 2
      );
    });

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View style={styles.phone}>
        {loading ? (
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
              Memuat beranda...
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
            <View
              style={
                styles.brandRow
              }
            >
              <View
                style={styles.logoBox}
              >
                <Text
                  style={
                    styles.logoText
                  }
                >
                  ◒
                </Text>
              </View>

              <View>
                <Text
                  style={
                    styles.brandTitle
                  }
                >
                  IsiKulkas
                </Text>

                <Text
                  style={
                    styles.brandSubtitle
                  }
                >
                  Jaga makanan tetap
                  segar, kurangi
                  pemborosan
                </Text>
              </View>
            </View>

            <Pressable
              style={
                styles.householdCard
              }
              onPress={() =>
                router.push(
                  '/members'
                )
              }
            >
              <View>
                <Text
                  style={
                    styles.householdLabel
                  }
                >
                  Kulkas aktif
                </Text>

                <Text
                  style={
                    styles.householdName
                  }
                >
                  {householdName ||
                    'Kulkas Bersama'}
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
              style={
                styles.shoppingCard
              }
            >
              <View
                style={
                  styles.decorCircle
                }
              />

              <Text
                style={
                  styles.shoppingTitle
                }
              >
                Habis Belanja?
              </Text>

              <Text
                style={
                  styles.shoppingText
                }
              >
                Pindai struk belanja untuk
                mencatat bahan makanan
                dengan lebih cepat.
              </Text>

              <Pressable
                style={
                  styles.scanButton
                }
                onPress={() =>
                  router.push(
                    '/scanner'
                  )
                }
              >
                <Text
                  style={
                    styles.scanButtonText
                  }
                >
                  ⌕ Pindai Struk Belanja
                </Text>
              </Pressable>

              <Pressable
                style={
                  styles.manualButton
                }
                onPress={() =>
                  router.push(
                    '/manual-add'
                  )
                }
              >
                <Text
                  style={
                    styles.manualButtonText
                  }
                >
                  ＋ Input Manual
                </Text>
              </Pressable>
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
              Ringkasan Persediaan
            </Text>

            <View
              style={styles.summaryRow}
            >
              <Pressable
                style={styles.summaryCard}
                onPress={() =>
                  router.push(
                    '/fridge'
                  )
                }
              >
                <View
                  style={
                    styles.summaryLabelRow
                  }
                >
                  <View
                    style={
                      styles.summaryIconGreen
                    }
                  >
                    <Text>▣</Text>
                  </View>

                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    Total Bahan
                  </Text>
                </View>

                <Text
                  style={
                    styles.summaryNumber
                  }
                >
                  {items.length}
                </Text>

                <Text
                  style={
                    styles.summaryCaption
                  }
                >
                  bahan aktif
                </Text>
              </Pressable>

              <Pressable
                style={styles.summaryCard}
                onPress={() =>
                  router.push(
                    '/fridge'
                  )
                }
              >
                <View
                  style={
                    styles.summaryLabelRow
                  }
                >
                  <View
                    style={
                      styles.summaryIconRed
                    }
                  >
                    <Text>⚠</Text>
                  </View>

                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    Segera Kadaluarsa
                  </Text>
                </View>

                <Text
                  style={[
                    styles.summaryNumber,
                    styles.urgentNumber,
                  ]}
                >
                  {urgentItems.length}
                </Text>

                <Text
                  style={
                    styles.summaryCaption
                  }
                >
                  gunakan dalam 48 jam
                </Text>
              </Pressable>
            </View>

            <View
              style={
                styles.sectionHeader
              }
            >
              <Text
                style={
                  styles.sectionTitleNoMargin
                }
              >
                Perlu segera digunakan
              </Text>

              <Pressable
                onPress={() =>
                  router.push(
                    '/fridge'
                  )
                }
              >
                <Text
                  style={
                    styles.seeAllText
                  }
                >
                  Lihat semua
                </Text>
              </Pressable>
            </View>

            {urgentItems.length ===
            0 ? (
              <View
                style={styles.emptyUrgent}
              >
                <Text
                  style={
                    styles.emptyUrgentText
                  }
                >
                  Belum ada bahan yang
                  segera kadaluarsa.
                </Text>
              </View>
            ) : (
              urgentItems
                .slice(0, 3)
                .map((item) => (
                  <Pressable
                    key={item.id}
                    style={
                      styles.urgentCard
                    }
                    onPress={() =>
                      router.push({
                        pathname:
                          '/edit-item',
                        params: {
                          id: item.id,
                        },
                      })
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
                        styles.urgentInfo
                      }
                    >
                      <Text
                        style={
                          styles.urgentName
                        }
                      >
                        {item.name}
                      </Text>

                      <Text
                        style={
                          styles.urgentExpiry
                        }
                      >
                        {getExpiryText(
                          item.expiry_date
                        )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.urgentDot
                      }
                    />
                  </Pressable>
                ))
            )}
          </ScrollView>
        )}

        <View
          style={styles.bottomNav}
        >
          <Pressable
            style={styles.navItem}
          >
            <Text
              style={
                styles.activeNavIcon
              }
            >
              ⌂
            </Text>

            <Text
              style={
                styles.activeNavText
              }
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
            onPress={() =>
              router.push(
                '/settings'
              )
            }
          >
            <Text
              style={styles.navIcon}
            >
              ⚙
            </Text>

            <Text
              style={styles.navText}
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
      paddingTop: 25,
      paddingBottom: 34,
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

    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },

    logoBox: {
      width: 46,
      height: 46,
      borderRadius: 11,
      backgroundColor: '#2F7556',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    logoText: {
      color: '#FFFFFF',
      fontSize: 24,
    },

    brandTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: '#252A25',
    },

    brandSubtitle: {
      fontSize: 11,
      color: '#7F877F',
      marginTop: 2,
    },

    householdCard: {
      minHeight: 76,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#DDE2DD',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 20,
    },

    householdLabel: {
      fontSize: 10,
      color: '#868E87',
      marginBottom: 3,
    },

    householdName: {
      fontSize: 17,
      fontWeight: '700',
      color: '#2B302B',
    },

    chevron: {
      fontSize: 28,
      color: '#7F887F',
    },

    shoppingCard: {
      borderRadius: 16,
      backgroundColor: '#388560',
      padding: 20,
      marginBottom: 26,
      overflow: 'hidden',
    },

    decorCircle: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      right: -28,
      top: -35,
      backgroundColor:
        'rgba(255,255,255,0.10)',
    },

    shoppingTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    shoppingText: {
      fontSize: 12,
      lineHeight: 18,
      color:
        'rgba(255,255,255,0.92)',
      marginTop: 6,
      maxWidth: 280,
    },

    scanButton: {
      height: 52,
      borderRadius: 11,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
    },

    scanButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#2F7556',
    },

    manualButton: {
      height: 46,
      borderRadius: 11,
      borderWidth: 1,
      borderColor:
        'rgba(255,255,255,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      backgroundColor:
        'rgba(255,255,255,0.08)',
    },

    manualButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    errorBox: {
      backgroundColor: '#FCEAE7',
      borderRadius: 10,
      padding: 11,
      marginBottom: 18,
    },

    errorText: {
      fontSize: 10,
      color: '#B95242',
    },

    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#292E29',
      marginBottom: 12,
    },

    sectionTitleNoMargin: {
      fontSize: 17,
      fontWeight: '700',
      color: '#292E29',
    },

    summaryRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 28,
    },

    summaryCard: {
      flex: 1,
      minHeight: 126,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#DFE3DF',
      backgroundColor: '#FFFFFF',
      padding: 15,
    },

    summaryLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    summaryIconGreen: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: '#E7F3EB',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },

    summaryIconRed: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: '#FDE5E1',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },

    summaryLabel: {
      flex: 1,
      fontSize: 10,
      color: '#687068',
    },

    summaryNumber: {
      fontSize: 30,
      fontWeight: '800',
      color: '#252A25',
      marginTop: 16,
    },

    urgentNumber: {
      color: '#E65338',
    },

    summaryCaption: {
      fontSize: 9,
      color: '#9AA19B',
      marginTop: 2,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 12,
    },

    seeAllText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#2F7556',
    },

    urgentCard: {
      minHeight: 76,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: '#DFE3DF',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },

    foodIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#F2F5F2',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    foodEmoji: {
      fontSize: 20,
    },

    urgentInfo: {
      flex: 1,
    },

    urgentName: {
      fontSize: 13,
      fontWeight: '700',
      color: '#2C312C',
    },

    urgentExpiry: {
      fontSize: 10,
      color: '#E75D43',
      marginTop: 3,
    },

    urgentDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#F36A3E',
    },

    emptyUrgent: {
      borderRadius: 13,
      borderWidth: 1,
      borderColor: '#DFE3DF',
      backgroundColor: '#FFFFFF',
      padding: 18,
      alignItems: 'center',
    },

    emptyUrgentText: {
      fontSize: 10,
      color: '#8A918B',
      textAlign: 'center',
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

    navIcon: {
      fontSize: 21,
      color: '#9AA39C',
      marginBottom: 4,
    },

    navText: {
      fontSize: 10,
      color: '#9AA39C',
    },
  });