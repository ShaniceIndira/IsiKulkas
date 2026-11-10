import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  router,
  useLocalSearchParams,
} from 'expo-router';
import {
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  cancelExpiryNotification,
  scheduleExpiryNotification,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';

const categories = [
  'Daging',
  'Sayur',
  'Buah',
  'Susu',
  'Cairan',
  'Lainnya',
];

function parseISODate(
  value?: string | null
) {
  if (!value) {
    return new Date();
  }

  const parts = value.split('-');

  if (parts.length !== 3) {
    return new Date();
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(
    year,
    month - 1,
    day
  );
}

function formatISODate(date: Date) {
  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(
  value?: string
) {
  if (!value) {
    return 'Pilih tanggal';
  }

  const date =
    parseISODate(value);

  return date.toLocaleDateString(
    'id-ID',
    {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }
  );
}

export default function EditItemScreen() {
  const params =
    useLocalSearchParams<{
      id?: string;
    }>();

  const itemId =
    typeof params.id === 'string'
      ? params.id
      : '';

  const [name, setName] =
    useState('');

  const [
    quantity,
    setQuantity,
  ] = useState('');

  const [
    stockGrams,
    setStockGrams,
  ] = useState('');

  const [
    category,
    setCategory,
  ] = useState('Lainnya');

  const [
    expiryDate,
    setExpiryDate,
  ] = useState('');

  const [notes, setNotes] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    showDatePicker,
    setShowDatePicker,
  ] = useState(false);

  useEffect(() => {
    loadItem();
  }, [itemId]);

  async function loadItem() {
    if (!itemId) {
      setErrorMessage(
        'Item tidak ditemukan.'
      );

      setLoading(false);

      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const {
        data,
        error,
      } = await supabase
        .from('fridge_items')
        .select(
          `
          id,
          name,
          quantity,
          category,
          stock_grams,
          expiry_date,
          notes
        `
        )
        .eq('id', itemId)
        .maybeSingle();

      if (error) {
        console.error(
          'Load item error:',
          error
        );

        setErrorMessage(
          error.message
        );

        return;
      }

      if (!data) {
        setErrorMessage(
          'Item tidak ditemukan.'
        );

        return;
      }

      setName(
        data.name || ''
      );

      setQuantity(
        data.quantity || ''
      );

      setStockGrams(
        data.stock_grams !== null &&
        data.stock_grams !== undefined
          ? String(data.stock_grams)
          : ''
      );

      setCategory(
        data.category ||
          'Lainnya'
      );

      setExpiryDate(
        data.expiry_date || ''
      );

      setNotes(
        data.notes || ''
      );
    } catch (error) {
      console.error(
        'Load item error:',
        error
      );

      setErrorMessage(
        'Gagal memuat data bahan.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDateChange(
    event: any,
    selectedDate?: Date
  ) {
    if (
      Platform.OS !== 'ios'
    ) {
      setShowDatePicker(false);
    }

    if (!selectedDate) {
      return;
    }

    setExpiryDate(
      formatISODate(
        selectedDate
      )
    );
  }

  async function handleSave() {
    if (saving) return;

    if (!name.trim()) {
      setErrorMessage(
        'Nama bahan harus diisi.'
      );

      return;
    }

    const isGramCategory =
      category === 'Daging' ||
      category === 'Sayur';

    let stockGramsValue: number | null = null;

    if (isGramCategory) {
      const trimmedStockGrams =
        stockGrams.trim();

      if (!trimmedStockGrams) {
        setErrorMessage(
          'Berat stok harus diisi untuk kategori Daging dan Sayur.'
        );

        return;
      }

      const parsedStockGrams =
        Number(trimmedStockGrams);

      if (
        !Number.isSafeInteger(parsedStockGrams) ||
        parsedStockGrams < 0
      ) {
        setErrorMessage(
          'Berat stok harus berupa angka bulat 0 atau lebih.'
        );

        return;
      }

      stockGramsValue =
        parsedStockGrams;
    }

    try {
      setSaving(true);
      setErrorMessage('');

      const {
        error: updateError,
      } = await supabase
        .from('fridge_items')
        .update({
          name: name.trim(),

          quantity:
            quantity.trim() ||
            null,

          category:
            category ||
            'Lainnya',

          stock_grams:
            stockGramsValue,

          expiry_date:
            expiryDate ||
            null,

          notes:
            notes.trim() ||
            null,
        })
        .eq('id', itemId);

      if (updateError) {
        console.error(
          'Update item error:',
          updateError
        );

        setErrorMessage(
          updateError.message
        );

        return;
      }

      /*
        Ambil kedua preference
        notification user/device.
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

      try {
        /*
          Hanya schedule kalau:
          1. Master notification ON
          2. Expiry reminder ON
          3. Ada tanggal expiry
        */
        if (
          notificationEnabled &&
          expiryReminderEnabled &&
          expiryDate
        ) {
          await scheduleExpiryNotification(
            itemId,
            name.trim(),
            expiryDate
          );
        } else {
          /*
            Kalau salah satu setting OFF
            atau expiry date dihapus,
            cancel reminder item ini.
          */
          await cancelExpiryNotification(
            itemId
          );
        }
      } catch (
        notificationError
      ) {
        console.error(
          'Notification update error:',
          notificationError
        );
      }

      router.replace('/fridge');
    } catch (error) {
      console.error(
        'Save edit error:',
        error
      );

      setErrorMessage(
        'Gagal menyimpan perubahan.'
      );
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(
        '/fridge'
      );
    }
  }

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
              Memuat bahan...
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
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable
              style={
                styles.backButton
              }
              onPress={handleBack}
            >
              <Text
                style={
                  styles.backText
                }
              >
                ‹
              </Text>
            </Pressable>

            <Text
              style={
                styles.headerTitle
              }
            >
              Edit Bahan
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
            Update bahan makanan
          </Text>

          <Text
            style={
              styles.description
            }
          >
            Perbarui informasi bahan
            yang tersimpan di kulkas
            bersama.
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

          <View
            style={styles.field}
          >
            <Text
              style={styles.label}
            >
              Nama bahan
            </Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Contoh: Susu"
              placeholderTextColor="#A4AAA5"
              style={styles.input}
            />
          </View>

          <View
            style={styles.field}
          >
            <Text
              style={styles.label}
            >
              Jumlah
            </Text>

            <TextInput
              value={quantity}
              onChangeText={
                setQuantity
              }
              placeholder="Contoh: 1 liter"
              placeholderTextColor="#A4AAA5"
              style={styles.input}
            />
          </View>

          <View
            style={styles.field}
          >
            <Text
              style={styles.label}
            >
              Kategori
            </Text>

            <View
              style={
                styles.categoryContainer
              }
            >
              {categories.map(
                (item) => (
                  <Pressable
                    key={item}
                    style={[
                      styles.categoryButton,

                      category ===
                        item &&
                        styles.categoryButtonActive,
                    ]}
                    onPress={() =>
                      setCategory(
                        item
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.categoryText,

                        category ===
                          item &&
                          styles.categoryTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </View>

          {category === 'Daging' ||
          category === 'Sayur' ? (
            <View
              style={styles.field}
            >
              <Text
                style={styles.label}
              >
                Sisa stok (gram)
              </Text>

              <TextInput
                value={stockGrams}
                onChangeText={(value) =>
                  setStockGrams(
                    value.replace(/[^0-9]/g, '')
                  )
                }
                placeholder="Contoh: 1000"
                placeholderTextColor="#A4AAA5"
                style={styles.input}
                keyboardType="number-pad"
              />

              <Text
                style={styles.helperText}
              >
                Masukkan angka dalam gram. Contoh: 1000 untuk 1 kg.
              </Text>
            </View>
          ) : null}

          <View
            style={styles.field}
          >
            <Text
              style={styles.label}
            >
              Tanggal kadaluarsa
            </Text>

            {Platform.OS ===
            'web' ? (
              <TextInput
                value={expiryDate}
                onChangeText={
                  setExpiryDate
                }
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#A4AAA5"
                style={styles.input}
              />
            ) : (
              <>
                <Pressable
                  style={
                    styles.dateButton
                  }
                  onPress={() =>
                    setShowDatePicker(
                      true
                    )
                  }
                >
                  <Text
                    style={
                      expiryDate
                        ? styles.dateButtonText
                        : styles.datePlaceholder
                    }
                  >
                    {formatDisplayDate(
                      expiryDate
                    )}
                  </Text>

                  <Text
                    style={
                      styles.calendarIcon
                    }
                  >
                    ◫
                  </Text>
                </Pressable>

                {showDatePicker ? (
                  <DateTimePicker
                    value={parseISODate(
                      expiryDate
                    )}
                    mode="date"
                    display="default"
                    onChange={
                      handleDateChange
                    }
                  />
                ) : null}
              </>
            )}

            {expiryDate ? (
              <Pressable
                style={
                  styles.clearDateButton
                }
                onPress={() =>
                  setExpiryDate('')
                }
              >
                <Text
                  style={
                    styles.clearDateText
                  }
                >
                  Hapus tanggal
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View
            style={styles.field}
          >
            <Text
              style={styles.label}
            >
              Catatan
            </Text>

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Catatan tambahan..."
              placeholderTextColor="#A4AAA5"
              style={[
                styles.input,
                styles.notesInput,
              ]}
              multiline
              textAlignVertical="top"
            />
          </View>

          <Pressable
            style={[
              styles.saveButton,

              saving &&
                styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
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
                Simpan Perubahan
              </Text>
            )}
          </Pressable>

          <Text
            style={
              styles.footerText
            }
          >
            Perubahan akan langsung
            terlihat oleh anggota
            kulkas lainnya.
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
      flex: 1,
      width: '100%',
      maxWidth: 430,
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

    headerTitle: {
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
      marginBottom: 24,
    },

    field: {
      marginBottom: 19,
    },

    label: {
      fontSize: 11,
      fontWeight: '700',
      color: '#4D554E',
      marginBottom: 7,
    },

    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: '#DFE4DF',
      borderRadius: 10,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 14,
      fontSize: 12,
      color: '#252A25',
      outlineStyle: 'none',
    } as any,

    helperText: {
      fontSize: 10,
      lineHeight: 15,
      color: '#8A938B',
      marginTop: 6,
    },

    notesInput: {
      minHeight: 100,
      paddingTop: 13,
      paddingBottom: 13,
    },

    categoryContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },

    categoryButton: {
      paddingHorizontal: 13,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#DDE2DD',
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
      color: '#727A73',
    },

    categoryTextActive: {
      color: '#FFFFFF',
    },

    dateButton: {
      height: 48,
      borderWidth: 1,
      borderColor: '#DFE4DF',
      borderRadius: 10,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    dateButtonText: {
      fontSize: 12,
      color: '#252A25',
    },

    datePlaceholder: {
      fontSize: 12,
      color: '#A4AAA5',
    },

    calendarIcon: {
      fontSize: 17,
      color: '#7C857D',
    },

    clearDateButton: {
      alignSelf: 'flex-start',
      marginTop: 7,
    },

    clearDateText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#C45546',
    },

    errorBox: {
      backgroundColor: '#FCEAE7',
      borderRadius: 9,
      padding: 11,
      marginBottom: 18,
    },

    errorText: {
      color: '#B95242',
      fontSize: 10,
      lineHeight: 15,
    },

    saveButton: {
      height: 54,
      borderRadius: 11,
      backgroundColor: '#2F7556',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 5,
    },

    saveButtonDisabled: {
      opacity: 0.55,
    },

    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },

    footerText: {
      fontSize: 9,
      lineHeight: 14,
      color: '#9AA19B',
      textAlign: 'center',
      marginTop: 11,
      paddingHorizontal: 15,
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