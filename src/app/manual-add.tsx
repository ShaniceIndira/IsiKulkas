import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const categories = [
  'Cairan',
  'Daging',
  'Sayur',
  'Buah',
  'Susu',
  'Lainnya',
];

export default function ManualAddScreen() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');

  const [expiryDate, setExpiryDate] = useState('');
  const [expiryDisplay, setExpiryDisplay] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [notes, setNotes] = useState('');

  const canSubmit =
    name.trim() !== '' &&
    category.trim() !== '' &&
    quantity.trim() !== '';

  function formatDateForDisplay(date: Date) {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatDateForStorage(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function handleDateChange(event: any, date?: Date) {
    setShowDatePicker(false);

    if (date) {
      setSelectedDate(date);
      setExpiryDate(formatDateForStorage(date));
      setExpiryDisplay(formatDateForDisplay(date));
    }
  }

  function handleWebDateChange(value: string) {
    setExpiryDate(value);

    if (!value) {
      setExpiryDisplay('');
      return;
    }

    const [year, month, day] = value.split('-').map(Number);

    const date = new Date(year, month - 1, day);

    setSelectedDate(date);
    setExpiryDisplay(formatDateForDisplay(date));
  }

  function handleAdd() {
    if (!canSubmit) return;

    router.push({
      pathname: '/confirmation',
      params: {
        manualName: name,
        manualCategory: category,
        manualQuantity: quantity,
        manualExpiry: expiryDate,
        manualNotes: notes,
      },
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.phone}>
        <View style={styles.container}>
          {/* HEADER */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backText}>←</Text>
            </Pressable>

            <Text style={styles.title}>
              Tambah Bahan Manual
            </Text>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                1 Bahan
              </Text>
            </View>
          </View>

          <Text style={styles.subtitle}>
            Isi detail bahan yang belum terdeteksi otomatis.
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.form}
          >
            {/* NAMA BAHAN */}
            <View style={styles.fieldCard}>
              <View style={styles.iconCircleGreen}>
                <Text style={styles.iconText}>◯</Text>
              </View>

              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  Nama bahan
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Contoh: Bayam Organik"
                  placeholderTextColor="#A4AAA5"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            {/* KATEGORI */}
            <View style={styles.categoryCard}>
              <View style={styles.categoryHeader}>
                <View style={styles.iconCircleBlue}>
                  <Text style={styles.iconText}>▣</Text>
                </View>

                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>
                    Kategori
                  </Text>

                  <Text style={styles.categoryHint}>
                    Pilih kategori bahan
                  </Text>
                </View>
              </View>

              <View style={styles.categoryWrap}>
                {categories.map((item) => (
                  <Pressable
                    key={item}
                    style={[
                      styles.categoryChip,
                      category === item &&
                        styles.categoryChipActive,
                    ]}
                    onPress={() => setCategory(item)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        category === item &&
                          styles.categoryChipTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* JUMLAH */}
            <View style={styles.fieldCard}>
              <View style={styles.iconCircleRed}>
                <Text style={styles.iconText}>◉</Text>
              </View>

              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  Jumlah
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Contoh: 2 bungkus"
                  placeholderTextColor="#A4AAA5"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>
            </View>

            {/* TANGGAL */}
            {Platform.OS === 'web' ? (
              <View style={styles.fieldCard}>
                <View style={styles.iconCircleBlue}>
                  <Text style={styles.iconText}>◫</Text>
                </View>

                <View style={styles.fieldContent}>
                  <Text style={styles.fieldLabel}>
                    Tanggal kadaluarsa
                  </Text>

                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#A4AAA5"
                    value={expiryDate}
                    onChangeText={handleWebDateChange}
                  />

                  {expiryDisplay ? (
                    <Text style={styles.dateHint}>
                      {expiryDisplay}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.fieldCard}
                  onPress={() => setShowDatePicker(true)}
                >
                  <View style={styles.iconCircleBlue}>
                    <Text style={styles.iconText}>◫</Text>
                  </View>

                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldLabel}>
                      Tanggal kadaluarsa
                    </Text>

                    <Text
                      style={
                        expiryDisplay
                          ? styles.dateValue
                          : styles.datePlaceholder
                      }
                    >
                      {expiryDisplay ||
                        'Pilih tanggal kadaluarsa'}
                    </Text>
                  </View>

                  <Text style={styles.calendar}>▢</Text>
                </Pressable>

                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={handleDateChange}
                  />
                )}
              </>
            )}

            {/* CATATAN */}
            <View style={styles.fieldCardLarge}>
              <View style={styles.iconCircleGreen}>
                <Text style={styles.iconText}>◯</Text>
              </View>

              <View style={styles.fieldContent}>
                <Text style={styles.fieldLabel}>
                  Catatan
                </Text>

                <TextInput
                  style={styles.notesInput}
                  placeholder="Opsional, misalnya lokasi penyimpanan"
                  placeholderTextColor="#A4AAA5"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              </View>
            </View>

            {/* PREVIEW */}
            <View style={styles.previewCard}>
              <View style={styles.iconCircleGreen}>
                <Text style={styles.iconText}>◯</Text>
              </View>

              <View style={styles.previewContent}>
                <Text style={styles.fieldLabel}>
                  Pratinjau bahan
                </Text>

                <Text style={styles.previewName}>
                  {name || 'Nama bahan'}
                </Text>

                <Text style={styles.previewText}>
                  {quantity || 'Jumlah belum diisi'}
                  {category ? ` • ${category}` : ''}
                </Text>

                {expiryDisplay ? (
                  <Text style={styles.previewText}>
                    Kadaluarsa: {expiryDisplay}
                  </Text>
                ) : null}

                {notes ? (
                  <Text style={styles.previewText}>
                    Catatan: {notes}
                  </Text>
                ) : null}
              </View>
            </View>
          </ScrollView>

          {/* BUTTON */}
          <Pressable
            style={[
              styles.addButton,
              !canSubmit &&
                styles.addButtonDisabled,
            ]}
            disabled={!canSubmit}
            onPress={handleAdd}
          >
            <Text style={styles.addButtonText}>
              Tambahkan ke daftar →
            </Text>
          </Pressable>
        </View>
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

  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },

  backText: {
    fontSize: 28,
    color: '#222',
  },

  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: '700',
    color: '#232823',
  },

  badge: {
    backgroundColor: '#E7F4E9',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },

  badgeText: {
    fontSize: 10,
    color: '#2F7556',
    fontWeight: '600',
  },

  subtitle: {
    fontSize: 12,
    color: '#858B86',
    marginBottom: 16,
  },

  form: {
    paddingBottom: 110,
  },

  fieldCard: {
    minHeight: 66,
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 10,
  },

  fieldCardLarge: {
    minHeight: 86,
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 14,
    marginBottom: 10,
  },

  categoryCard: {
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 10,
  },

  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  categoryHint: {
    fontSize: 12,
    color: '#A4AAA5',
  },

  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  categoryChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#F1F3F1',
    borderWidth: 1,
    borderColor: '#E4E8E4',
  },

  categoryChipActive: {
    backgroundColor: '#2F7556',
    borderColor: '#2F7556',
  },

  categoryChipText: {
    fontSize: 12,
    color: '#687069',
    fontWeight: '600',
  },

  categoryChipTextActive: {
    color: '#FFFFFF',
  },

  iconCircleGreen: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E4F4E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  iconCircleBlue: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E5F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  iconCircleRed: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFE6E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  iconText: {
    fontSize: 16,
  },

  fieldContent: {
    flex: 1,
  },

  fieldLabel: {
    fontSize: 11,
    color: '#5F6660',
    marginBottom: 3,
  },

  input: {
    fontSize: 13,
    color: '#252A25',
    padding: 0,
  },

  dateValue: {
    fontSize: 13,
    color: '#252A25',
  },

  datePlaceholder: {
    fontSize: 13,
    color: '#A4AAA5',
  },

  dateHint: {
    fontSize: 10,
    color: '#7E857F',
    marginTop: 3,
  },

  notesInput: {
    fontSize: 13,
    color: '#252A25',
    padding: 0,
    minHeight: 42,
    textAlignVertical: 'top',
  },

  calendar: {
    fontSize: 16,
    color: '#7B837D',
  },

  previewCard: {
    minHeight: 82,
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  previewContent: {
    flex: 1,
    paddingVertical: 10,
  },

  previewName: {
    fontSize: 13,
    color: '#252A25',
    fontWeight: '600',
    marginBottom: 2,
  },

  previewText: {
    fontSize: 11,
    color: '#7D847E',
    lineHeight: 16,
  },

  addButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 18,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#2F7556',
    alignItems: 'center',
    justifyContent: 'center',
  },

  addButtonDisabled: {
    backgroundColor: '#B9C3BC',
  },

  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});