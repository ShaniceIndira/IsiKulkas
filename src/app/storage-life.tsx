import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { scheduleExpiryNotification } from '../lib/notifications';
import { supabase } from '../lib/supabase';

type FoodItem = {
  id: string;
  name: string;
  qty?: string;
  category?: string;
  expiry?: string;
  notes?: string;
  stock_grams?: number | null;
  confirmed?: boolean;
  color?: string;
  icon?: string;
};

function supportsGramStock(category?: string) {
  return category === 'Daging' || category === 'Sayur';
}

function parseISODate(value?: string) {
  if (!value) return null;

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
  expiry?: string
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

function formatDisplayDate(
  value?: string
) {
  const date =
    parseISODate(value);

  if (!date) {
    return 'Belum diisi';
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

function getCategoryIcon(
  category?: string
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

function getExpiryLabel(
  expiry?: string
) {
  const days =
    getDaysUntilExpiry(expiry);

  if (days === null) {
    return {
      text: 'Tanggal belum diisi',
      type: 'neutral',
    };
  }

  if (days < 0) {
    return {
      text: 'Sudah kadaluarsa',
      type: 'danger',
    };
  }

  if (days === 0) {
    return {
      text: 'Kadaluarsa hari ini',
      type: 'danger',
    };
  }

  if (days === 1) {
    return {
      text: 'Kadaluarsa besok',
      type: 'warning',
    };
  }

  if (days <= 3) {
    return {
      text: `${days} hari lagi`,
      type: 'warning',
    };
  }

  return {
    text: `${days} hari lagi`,
    type: 'safe',
  };
}

export default function StorageLifeScreen() {
  const params =
    useLocalSearchParams<{
      items?: string;
    }>();

  const [saving, setSaving] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const items = useMemo(() => {
    try {
      if (!params.items) {
        return [];
      }

      const parsed =
        JSON.parse(params.items);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed as FoodItem[];
    } catch (error) {
      console.error(
        'Parse items error:',
        error
      );

      return [];
    }
  }, [params.items]);

  const confirmedItems =
    useMemo(() => {
      return items.filter(
        (item) =>
          item.confirmed !== false &&
          item.name?.trim()
      );
    }, [items]);

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

  async function handleSave() {
    if (saving) return;

    if (
      confirmedItems.length === 0
    ) {
      setErrorMessage(
        'Tidak ada bahan yang bisa disimpan.'
      );
      return;
    }

    try {
      setSaving(true);
      setErrorMessage('');

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (userError || !user) {
        router.replace('/auth');
        return;
      }

      const householdId =
        await getActiveHouseholdId(
          user.id
        );

      if (!householdId) {
        setErrorMessage(
          'Kulkas aktif tidak ditemukan.'
        );
        return;
      }

      // Pastikan nilai stok gram valid sebelum dikirim ke Supabase.
      const invalidStockItem =
        confirmedItems.find((item) => {
          if (!supportsGramStock(item.category)) {
            return false;
          }

          if (
            item.stock_grams === null ||
            item.stock_grams === undefined
          ) {
            return false;
          }

          return (
            !Number.isSafeInteger(item.stock_grams) ||
            item.stock_grams < 0
          );
        });

      if (invalidStockItem) {
        setErrorMessage(
          `Berat stok ${invalidStockItem.name} tidak valid. Masukkan angka bulat gram tanpa desimal atau angka negatif.`
        );
        return;
      }

      const rows =
        confirmedItems.map(
          (item) => ({
            household_id:
              householdId,

            created_by:
              user.id,

            name:
              item.name.trim(),

            quantity:
              item.qty?.trim() ||
              null,

            category:
              item.category ||
              'Lainnya',

            // Stok gram hanya berlaku untuk Daging dan Sayur.
            // Kategori lain disimpan sebagai NULL.
            stock_grams:
              supportsGramStock(item.category)
                ? item.stock_grams ?? null
                : null,

            expiry_date:
              item.expiry ||
              null,

            notes:
              item.notes?.trim() ||
              null,

            status: 'active',
          })
        );

      const {
        data: insertedItems,
        error: insertError,
      } = await supabase
        .from('fridge_items')
        .insert(rows)
        .select(
          'id, name, expiry_date'
        );

      if (insertError) {
        console.error(
          'Insert fridge item error:',
          insertError
        );

        setErrorMessage(
          insertError.message
        );

        return;
      }

      /*
        Ambil preference notification
        milik user/device ini.

        Default ON kalau belum pernah
        disimpan sebelumnya.
      */
      const [
        notificationSetting,
        expirySetting,
      ] =
        await Promise.all([
          AsyncStorage.getItem(
            'notificationEnabled'
          ),

          AsyncStorage.getItem(
            'expiryReminderEnabled'
          ),
        ]);

      const notificationEnabled =
        notificationSetting !==
        'false';

      const expiryReminderEnabled =
        expirySetting !== 'false';

      /*
        Reminder cuma dibuat kalau
        KEDUA toggle ON.
      */
      if (
        notificationEnabled &&
        expiryReminderEnabled &&
        insertedItems
      ) {
        for (
          const item of insertedItems
        ) {
          if (!item.expiry_date) {
            continue;
          }

          try {
            await scheduleExpiryNotification(
              item.id,
              item.name,
              item.expiry_date
            );
          } catch (
            notificationError
          ) {
            console.error(
              'Schedule notification error:',
              notificationError
            );
          }
        }
      }

      router.replace('/fridge');
    } catch (error) {
      console.error(
        'Save fridge error:',
        error
      );

      setErrorMessage(
        'Terjadi kesalahan saat menyimpan bahan.'
      );
    } finally {
      setSaving(false);
    }
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
          <View style={styles.header}>
            <Pressable
              style={
                styles.backButton
              }
              onPress={() =>
                router.back()
              }
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
              Masa Simpan
            </Text>

            <View
              style={
                styles.headerSpacer
              }
            />
          </View>

          <Text
            style={styles.heading}
          >
            Cek sebelum disimpan.
          </Text>

          <Text
            style={
              styles.description
            }
          >
            Pastikan tanggal kadaluarsa
            bahan makanan sudah sesuai.
          </Text>

          {confirmedItems.length ===
          0 ? (
            <View
              style={styles.emptyCard}
            >
              <Text
                style={
                  styles.emptyTitle
                }
              >
                Belum ada bahan
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                Kembali dan tambahkan
                bahan terlebih dahulu.
              </Text>
            </View>
          ) : (
            confirmedItems.map(
              (item) => {
                const expiry =
                  getExpiryLabel(
                    item.expiry
                  );

                return (
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
                          {item.qty ||
                            'Jumlah belum diisi'}
                        </Text>

                        {supportsGramStock(item.category) &&
                        item.stock_grams !== null &&
                        item.stock_grams !== undefined ? (
                          <Text style={styles.stockMeta}>
                            Stok: {item.stock_grams} gram
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View
                      style={
                        styles.divider
                      }
                    />

                    <View
                      style={
                        styles.dateRow
                      }
                    >
                      <View>
                        <Text
                          style={
                            styles.dateLabel
                          }
                        >
                          Kadaluarsa
                        </Text>

                        <Text
                          style={
                            styles.dateValue
                          }
                        >
                          {formatDisplayDate(
                            item.expiry
                          )}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.badge,

                          expiry.type ===
                            'danger' &&
                            styles.badgeDanger,

                          expiry.type ===
                            'warning' &&
                            styles.badgeWarning,

                          expiry.type ===
                            'safe' &&
                            styles.badgeSafe,

                          expiry.type ===
                            'neutral' &&
                            styles.badgeNeutral,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,

                            expiry.type ===
                              'danger' &&
                              styles.badgeTextDanger,

                            expiry.type ===
                              'warning' &&
                              styles.badgeTextWarning,

                            expiry.type ===
                              'safe' &&
                              styles.badgeTextSafe,

                            expiry.type ===
                              'neutral' &&
                              styles.badgeTextNeutral,
                          ]}
                        >
                          {expiry.text}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }
            )
          )}

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
              styles.saveButton,

              (saving ||
                confirmedItems.length ===
                  0) &&
                styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={
              saving ||
              confirmedItems.length ===
                0
            }
          >
            {saving ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.saveButtonText
                }
              >
                Simpan ke Kulkas →
              </Text>
            )}
          </Pressable>

          <Text
            style={
              styles.footerText
            }
          >
            Data akan tersimpan ke
            kulkas bersama dan dapat
            dilihat anggota lainnya.
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

    scroll: {
      flex: 1,
    },

    content: {
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 40,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 28,
    },

    backButton: {
      width: 38,
      height: 38,
      borderWidth: 1,
      borderColor: '#E1E5E1',
      borderRadius: 10,
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

    heading: {
      fontSize: 25,
      lineHeight: 31,
      fontWeight: '700',
      color: '#202520',
    },

    description: {
      fontSize: 12,
      lineHeight: 19,
      color: '#7F877F',
      marginTop: 7,
      marginBottom: 22,
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
      alignItems: 'center',
    },

    foodIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: '#F0F4F1',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 11,
    },

    foodEmoji: {
      fontSize: 20,
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

    stockMeta: {
      fontSize: 10,
      color: '#2F7556',
      fontWeight: '600',
      marginTop: 4,
    },

    divider: {
      height: 1,
      backgroundColor: '#EEF0EE',
      marginVertical: 13,
    },

    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: 12,
    },

    dateLabel: {
      fontSize: 9,
      color: '#969D97',
    },

    dateValue: {
      fontSize: 11,
      color: '#424942',
      fontWeight: '600',
      marginTop: 3,
    },

    badge: {
      maxWidth: 145,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 8,
    },

    badgeDanger: {
      backgroundColor: '#FDE8E5',
    },

    badgeWarning: {
      backgroundColor: '#FFF1DA',
    },

    badgeSafe: {
      backgroundColor: '#E7F3EB',
    },

    badgeNeutral: {
      backgroundColor: '#EEF0EE',
    },

    badgeText: {
      fontSize: 9,
      fontWeight: '700',
    },

    badgeTextDanger: {
      color: '#C95343',
    },

    badgeTextWarning: {
      color: '#B8751D',
    },

    badgeTextSafe: {
      color: '#2F7556',
    },

    badgeTextNeutral: {
      color: '#737A74',
    },

    errorBox: {
      backgroundColor: '#FCEAE7',
      borderRadius: 9,
      padding: 11,
      marginTop: 8,
      marginBottom: 12,
    },

    errorText: {
      color: '#B95242',
      fontSize: 10,
      lineHeight: 15,
    },

    saveButton: {
      height: 54,
      backgroundColor: '#2F7556',
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },

    saveButtonDisabled: {
      opacity: 0.55,
    },

    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },

    footerText: {
      fontSize: 9,
      lineHeight: 14,
      color: '#9AA19B',
      textAlign: 'center',
      marginTop: 11,
      paddingHorizontal: 14,
    },

    emptyCard: {
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E1E5E1',
      borderRadius: 14,
      padding: 18,
      marginBottom: 16,
    },

    emptyTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: '#282D29',
    },

    emptyText: {
      fontSize: 10,
      color: '#8A918B',
      marginTop: 4,
    },
  });
