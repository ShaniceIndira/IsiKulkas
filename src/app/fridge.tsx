import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  router,
  useFocusEffect,
} from 'expo-router';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  cancelExpiryNotification,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';

type FridgeItem = {
  id: string;
  household_id: string;
  created_by?: string | null;
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
  created_at?: string | null;
};

type ConfirmAction =
  | 'used'
  | 'delete'
  | null;

const categories = [
  'Semua',
  'Daging',
  'Sayur',
  'Buah',
  'Susu',
  'Cairan',
  'Lainnya',
];

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

function formatDate(
  value?: string | null
) {
  const date =
    parseISODate(value);

  if (!date) {
    return 'Belum ada tanggal';
  }

  return date.toLocaleDateString(
    'id-ID',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
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

  return `${days} hari lagi`;
}

export default function FridgeScreen() {
  const [items, setItems] =
    useState<FridgeItem[]>([]);

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState('Semua');

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const householdIdRef =
    useRef<string | null>(null);

  const [
    confirmVisible,
    setConfirmVisible,
  ] = useState(false);

  const [
    confirmAction,
    setConfirmAction,
  ] = useState<ConfirmAction>(null);

  const [
    selectedItem,
    setSelectedItem,
  ] = useState<FridgeItem | null>(
    null
  );

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      let realtimeChannel:
        | ReturnType<
            typeof supabase.channel
          >
        | null = null;

      async function setupScreen() {
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
                `fridge-${householdId}`
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
            'Setup fridge error:',
            error
          );

          if (isMounted) {
            setErrorMessage(
              'Gagal memuat isi kulkas.'
            );

            setLoading(false);
          }
        }
      }

      setupScreen();

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
          'Load fridge error:',
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
        'Load fridge error:',
        error
      );

      if (shouldUpdate) {
        setErrorMessage(
          'Gagal membaca isi kulkas.'
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

  function openConfirmation(
    item: FridgeItem,
    action: ConfirmAction
  ) {
    setSelectedItem(item);
    setConfirmAction(action);
    setConfirmVisible(true);
  }

  function closeConfirmation() {
    if (actionLoading) {
      return;
    }

    setConfirmVisible(false);
    setSelectedItem(null);
    setConfirmAction(null);
  }

  async function confirmActionHandler() {
    if (
      !selectedItem ||
      !confirmAction
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage('');

      if (
        confirmAction === 'used'
      ) {
        const { error } =
          await supabase
            .from('fridge_items')
            .update({
              status: 'used',
              used_at:
                new Date().toISOString(),
            })
            .eq(
              'id',
              selectedItem.id
            );

        if (error) {
          setErrorMessage(
            error.message
          );

          return;
        }

        try {
          await cancelExpiryNotification(
            selectedItem.id
          );
        } catch (
          notificationError
        ) {
          console.error(
            'Cancel expiry reminder error:',
            notificationError
          );
        }

        setItems((current) =>
          current.filter(
            (item) =>
              item.id !==
              selectedItem.id
          )
        );
      }

      if (
        confirmAction === 'delete'
      ) {
        const { error } =
          await supabase
            .from('fridge_items')
            .delete()
            .eq(
              'id',
              selectedItem.id
            );

        if (error) {
          setErrorMessage(
            error.message
          );

          return;
        }

        try {
          await cancelExpiryNotification(
            selectedItem.id
          );
        } catch (
          notificationError
        ) {
          console.error(
            'Cancel expiry reminder error:',
            notificationError
          );
        }

        setItems((current) =>
          current.filter(
            (item) =>
              item.id !==
              selectedItem.id
          )
        );
      }

      setConfirmVisible(false);
      setSelectedItem(null);
      setConfirmAction(null);
    } catch (error) {
      console.error(
        'Confirmation action error:',
        error
      );

      setErrorMessage(
        'Aksi gagal dilakukan.'
      );
    } finally {
      setActionLoading(false);
    }
  }

  const filteredItems =
    useMemo(() => {
      if (
        selectedCategory === 'Semua'
      ) {
        return items;
      }

      return items.filter(
        (item) =>
          item.category ===
          selectedCategory
      );
    }, [
      items,
      selectedCategory,
    ]);

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View style={styles.phone}>
        <View style={styles.header}>
          <Text style={styles.title}>
            Isi Kulkas
          </Text>

          <Text
            style={styles.subtitle}
          >
            {items.length} bahan aktif
          </Text>
        </View>

        <View
          style={
            styles.categoryWrapper
          }
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={
              false
            }
            style={
              styles.categoryScroll
            }
            contentContainerStyle={
              styles.categoryRow
            }
          >
            {categories.map(
              (category) => (
                <Pressable
                  key={category}
                  style={[
                    styles.categoryButton,
                    selectedCategory ===
                      category &&
                      styles.categoryButtonActive,
                  ]}
                  onPress={() =>
                    setSelectedCategory(
                      category
                    )
                  }
                >
                  <Text
                    style={[
                      styles.categoryText,
                      selectedCategory ===
                        category &&
                        styles.categoryTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </Pressable>
              )
            )}
          </ScrollView>
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
              Memuat isi kulkas...
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

            {filteredItems.length ===
            0 ? (
              <View
                style={styles.emptyCard}
              >
                <Text
                  style={
                    styles.emptyEmoji
                  }
                >
                  🧺
                </Text>

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  Kulkas masih kosong
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Tambahkan bahan melalui
                  scanner atau input
                  manual.
                </Text>

                <Pressable
                  style={
                    styles.addButton
                  }
                  onPress={() =>
                    router.push(
                      '/scanner'
                    )
                  }
                >
                  <Text
                    style={
                      styles.addButtonText
                    }
                  >
                    + Tambah Bahan
                  </Text>
                </Pressable>
              </View>
            ) : (
              filteredItems.map(
                (item) => {
                  const days =
                    getDaysUntilExpiry(
                      item.expiry_date
                    );

                  const urgent =
                    days !== null &&
                    days <= 2;

                  return (
                    <View
                      key={item.id}
                      style={
                        styles.itemCard
                      }
                    >
                      <View
                        style={
                          styles.itemMain
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
                              'Jumlah belum diisi'}
                            {' • '}
                            {item.category ||
                              'Lainnya'}
                          </Text>

                          <Text
                            style={[
                              styles.expiryText,
                              urgent &&
                                styles.expiryUrgent,
                            ]}
                          >
                            {getExpiryText(
                              item.expiry_date
                            )}
                          </Text>

                          <Text
                            style={
                              styles.dateText
                            }
                          >
                            {formatDate(
                              item.expiry_date
                            )}
                          </Text>
                        </View>
                      </View>

                      {item.notes ? (
                        <View
                          style={
                            styles.notesBox
                          }
                        >
                          <Text
                            style={
                              styles.notesText
                            }
                          >
                            {item.notes}
                          </Text>
                        </View>
                      ) : null}

                      <View
                        style={
                          styles.actionRow
                        }
                      >
                        <Pressable
                          style={
                            styles.editButton
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
                          <Text
                            style={
                              styles.editButtonText
                            }
                          >
                            Edit
                          </Text>
                        </Pressable>

                        <Pressable
                          style={
                            styles.usedButton
                          }
                          onPress={() =>
                            openConfirmation(
                              item,
                              'used'
                            )
                          }
                        >
                          <Text
                            style={
                              styles.usedButtonText
                            }
                          >
                            ✓ Sudah Terpakai
                          </Text>
                        </Pressable>

                        <Pressable
                          style={
                            styles.deleteButton
                          }
                          onPress={() =>
                            openConfirmation(
                              item,
                              'delete'
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
                  );
                }
              )
            )}
          </ScrollView>
        )}

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
          >
            <Text
              style={
                styles.activeNavIcon
              }
            >
              ▣
            </Text>

            <Text
              style={
                styles.activeNavText
              }
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

        <Modal
          visible={confirmVisible}
          transparent
          animationType="fade"
          onRequestClose={
            closeConfirmation
          }
        >
          <View
            style={styles.modalOverlay}
          >
            <View
              style={styles.modalCard}
            >
              <View
                style={[
                  styles.modalIcon,
                  confirmAction ===
                    'delete'
                    ? styles.modalIconDelete
                    : styles.modalIconUsed,
                ]}
              >
                <Text
                  style={
                    styles.modalIconText
                  }
                >
                  {confirmAction ===
                  'delete'
                    ? '!'
                    : '✓'}
                </Text>
              </View>

              <Text
                style={styles.modalTitle}
              >
                {confirmAction ===
                'delete'
                  ? 'Hapus bahan?'
                  : 'Tandai sebagai terpakai?'}
              </Text>

              <Text
                style={
                  styles.modalDescription
                }
              >
                {confirmAction ===
                'delete'
                  ? `"${selectedItem?.name}" akan dihapus permanen dari kulkas bersama.`
                  : `"${selectedItem?.name}" akan dipindahkan ke Riwayat.`}
              </Text>

              <View
                style={
                  styles.modalActions
                }
              >
                <Pressable
                  style={
                    styles.cancelButton
                  }
                  onPress={
                    closeConfirmation
                  }
                  disabled={
                    actionLoading
                  }
                >
                  <Text
                    style={
                      styles.cancelButtonText
                    }
                  >
                    Batal
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.confirmButton,
                    confirmAction ===
                      'delete'
                      ? styles.confirmDelete
                      : styles.confirmUsed,
                  ]}
                  onPress={
                    confirmActionHandler
                  }
                  disabled={
                    actionLoading
                  }
                >
                  {actionLoading ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                      size="small"
                    />
                  ) : (
                    <Text
                      style={
                        styles.confirmButtonText
                      }
                    >
                      {confirmAction ===
                      'delete'
                        ? 'Hapus'
                        : 'Ya, Tandai'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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

  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 15,
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
  },

  categoryWrapper: {
    height: 49,
  },

  categoryScroll: {
    flexGrow: 0,
  },

  categoryRow: {
    paddingHorizontal: 24,
    paddingBottom: 15,
    gap: 8,
  },

  categoryButton: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E0E4E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryButtonActive: {
    backgroundColor: '#2F7556',
    borderColor: '#2F7556',
  },

  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6F776F',
  },

  categoryTextActive: {
    color: '#FFFFFF',
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 24,
    paddingBottom: 30,
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

  errorBox: {
    backgroundColor: '#FCEAE7',
    borderRadius: 10,
    padding: 11,
    marginBottom: 12,
  },

  errorText: {
    fontSize: 10,
    color: '#B95242',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 15,
    padding: 24,
    alignItems: 'center',
    marginTop: 18,
  },

  emptyEmoji: {
    fontSize: 38,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 15,
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

  addButton: {
    height: 42,
    paddingHorizontal: 18,
    backgroundColor: '#2F7556',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },

  addButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  itemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 14,
    padding: 14,
    marginBottom: 11,
  },

  itemMain: {
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

  expiryText: {
    fontSize: 10,
    color: '#2F7556',
    fontWeight: '600',
    marginTop: 6,
  },

  expiryUrgent: {
    color: '#DF5A43',
  },

  dateText: {
    fontSize: 9,
    color: '#A0A6A0',
    marginTop: 2,
  },

  notesBox: {
    backgroundColor: '#F6F8F6',
    borderRadius: 8,
    padding: 9,
    marginTop: 11,
  },

  notesText: {
    fontSize: 9,
    lineHeight: 14,
    color: '#747C75',
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
    gap: 7,
  },

  editButton: {
    height: 35,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: '#EEF2EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  editButtonText: {
    color: '#536057',
    fontSize: 10,
    fontWeight: '700',
  },

  usedButton: {
    flex: 1,
    height: 35,
    borderRadius: 8,
    backgroundColor: '#E6F2EA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  usedButtonText: {
    color: '#2F7556',
    fontSize: 10,
    fontWeight: '700',
  },

  deleteButton: {
    width: 35,
    height: 35,
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

  bottomNav: {
    height: 82,
    borderTopWidth: 1,
    borderTopColor: '#EFF1EF',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
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

  modalOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(20, 25, 21, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
  },

  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  modalIconUsed: {
    backgroundColor: '#E6F2EA',
  },

  modalIconDelete: {
    backgroundColor: '#FBEAE7',
  },

  modalIconText: {
    fontSize: 19,
    fontWeight: '800',
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#252A25',
    textAlign: 'center',
  },

  modalDescription: {
    fontSize: 11,
    lineHeight: 17,
    color: '#7E867F',
    textAlign: 'center',
    marginTop: 8,
  },

  modalActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 9,
    marginTop: 20,
  },

  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#DEE3DF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#606861',
  },

  confirmButton: {
    flex: 1,
    height: 44,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmUsed: {
    backgroundColor: '#2F7556',
  },

  confirmDelete: {
    backgroundColor: '#C95748',
  },

  confirmButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});