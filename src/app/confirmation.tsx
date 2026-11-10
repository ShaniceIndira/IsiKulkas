import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FoodItem = {
  id: string;
  name: string;
  qty: string;
  category?: string;
  expiry?: string;
  notes?: string;
  color: string;
  icon: string;
  confirmed: boolean;
};

function formatExpiryForDisplay(expiry?: string) {
  if (!expiry) return '';

  const parts = expiry.split('-');

  if (parts.length !== 3) {
    return expiry;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) {
    return expiry;
  }

  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getCategoryIcon(category?: string) {
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

function getCategoryColor(category?: string) {
  switch (category) {
    case 'Daging':
      return '#FDE7E3';
    case 'Sayur':
      return '#E5F3E8';
    case 'Buah':
      return '#FFF0DC';
    case 'Susu':
      return '#E6F0FF';
    case 'Cairan':
      return '#E7F5FB';
    default:
      return '#F0F2F0';
  }
}

const CATEGORIES = ['Daging', 'Sayur', 'Buah', 'Susu', 'Cairan', 'Lainnya'] as const;

type EditForm = {
  name: string;
  qty: string;
  category: string;
  expiry: string;
  notes: string;
};

function normalizeOCRItem(value: unknown, index: number): FoodItem | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return null;

  const category =
    typeof input.category === 'string' &&
    CATEGORIES.some((item) => item === input.category)
      ? input.category
      : 'Lainnya';

  return {
    id: typeof input.id === 'string' && input.id
      ? input.id
      : `ocr-${Date.now()}-${index}`,
    name,
    qty: typeof input.qty === 'string' ? input.qty.trim() : '',
    category,
    expiry: typeof input.expiry === 'string' ? input.expiry : '',
    notes: typeof input.notes === 'string' ? input.notes : '',
    color: getCategoryColor(category),
    icon: getCategoryIcon(category),
    confirmed: typeof input.confirmed === 'boolean' ? input.confirmed : true,
  };
}

function showNotice(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function ConfirmationScreen() {
  const params = useLocalSearchParams<{
    items?: string;
    ocrText?: string;
    manualName?: string;
    manualCategory?: string;
    manualQuantity?: string;
    manualExpiry?: string;
    manualNotes?: string;
  }>();

  const [items, setItems] = useState<FoodItem[]>([]);
  const lastProcessedScan = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '', qty: '', category: 'Lainnya', expiry: '', notes: '',
  });

  // Scanner mengirim items sebagai JSON melalui router.push().
  // Muat hanya jika ada payload pemindaian yang baru.
  useEffect(() => {
    const raw = params.items;
    if (!raw || raw === lastProcessedScan.current) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Invalid items payload');
      const normalized = parsed
        .map((value, index) => normalizeOCRItem(value, index))
        .filter((value): value is FoodItem => value !== null);
      setItems(normalized);
      lastProcessedScan.current = raw;
    } catch (error) {
      console.error('Gagal membaca hasil OCR:', error);
      showNotice('Hasil scan gagal dimuat', 'Silakan kembali dan coba pindai ulang struk.');
    }
  }, [params.items]);

  // Pertahankan alur Tambah Bahan Manual yang sudah ada.
  useEffect(() => {
    const manualName = params.manualName;
    const manualCategory = params.manualCategory || 'Lainnya';
    const manualQuantity = params.manualQuantity;
    const manualExpiry = params.manualExpiry;
    const manualNotes = params.manualNotes;

    if (!manualName || !manualQuantity) return;

    setItems((currentItems) => {
      const alreadyExists = currentItems.some(
        (item) =>
          item.name === manualName &&
          item.qty === manualQuantity &&
          item.expiry === manualExpiry
      );
      if (alreadyExists) return currentItems;

      const newItem: FoodItem = {
        id: `manual-${Date.now()}-${Math.random()}`,
        name: manualName,
        qty: manualQuantity,
        category: manualCategory,
        expiry: manualExpiry,
        notes: manualNotes,
        color: getCategoryColor(manualCategory),
        icon: getCategoryIcon(manualCategory),
        confirmed: true,
      };
      return [...currentItems, newItem];
    });
  }, [
    params.manualName,
    params.manualCategory,
    params.manualQuantity,
    params.manualExpiry,
    params.manualNotes,
  ]);

  function toggleConfirmed(id: string) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, confirmed: !item.confirmed } : item
      )
    );
  }

  function removeItem(id: string) {
    setItems((currentItems) => currentItems.filter((item) => item.id !== id));
  }

  function startEditing(item: FoodItem) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      qty: item.qty,
      category: item.category || 'Lainnya',
      expiry: item.expiry || '',
      notes: item.notes || '',
    });
  }

  function saveEdit() {
    if (!editingId) return;
    if (!editForm.name.trim() || !editForm.qty.trim()) {
      showNotice('Data belum lengkap', 'Nama bahan dan jumlah wajib diisi.');
      return;
    }
    const expiry = editForm.expiry.trim();
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      showNotice('Format tanggal salah', 'Gunakan format YYYY-MM-DD, misalnya 2026-11-15.');
      return;
    }

    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === editingId
          ? {
              ...item,
              name: editForm.name.trim(),
              qty: editForm.qty.trim(),
              category: editForm.category,
              expiry,
              notes: editForm.notes.trim(),
              color: getCategoryColor(editForm.category),
              icon: getCategoryIcon(editForm.category),
            }
          : item
      )
    );
    setEditingId(null);
  }

  const confirmedCount = items.filter((item) => item.confirmed).length;
  const isOCRResult = items.some((item) => item.id.startsWith('ocr-'));

  function continueToStorageLife() {
    const confirmedItems = items.filter((item) => item.confirmed);
    if (!confirmedItems.length) return;

    if (confirmedItems.some((item) => !item.name.trim() || !item.qty.trim())) {
      showNotice(
        'Periksa hasil pemindaian',
        'Ada bahan yang jumlahnya belum terdeteksi. Tekan Edit pada bahan tersebut untuk mengisi jumlahnya.'
      );
      return;
    }

    router.push({
      pathname: '/storage-life',
      params: { items: JSON.stringify(confirmedItems) },
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.phone}>
        <View style={styles.container}>
          {/* HEADER */}
          <View style={styles.header}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backText}>
                ←
              </Text>
            </Pressable>

            <View style={styles.headerText}>
              <Text style={styles.title}>
                Hasil Pemindaian
              </Text>

              <Text style={styles.subtitle}>
                Periksa bahan sebelum
                ditambahkan ke kulkas.
              </Text>
            </View>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {confirmedCount} dipilih
              </Text>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={
              styles.scrollContent
            }
            showsVerticalScrollIndicator={false}
          >
            {isOCRResult ? (
              <View style={styles.ocrInfoCard}>
                <Text style={styles.ocrInfoText}>
                  Hasil OCR terisi otomatis. Periksa nama, jumlah, dan kategori setiap bahan sebelum melanjutkan.
                </Text>
              </View>
            ) : null}

            {/* EMPTY STATE */}
            {items.length === 0 && (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Text
                    style={styles.emptyIconText}
                  >
                    +
                  </Text>
                </View>

                <Text style={styles.emptyTitle}>
                  Belum ada bahan
                </Text>

                <Text style={styles.emptyText}>
                  Belum ada hasil pemindaian. Coba scan ulang
                  atau tambahkan bahan secara manual.
                </Text>
              </View>
            )}

            {/* ITEMS */}
            {items.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  item.confirmed &&
                    styles.itemCardConfirmed,
                ]}
              >
                <View
                  style={[
                    styles.itemIcon,
                    {
                      backgroundColor:
                        item.color,
                    },
                  ]}
                >
                  <Text
                    style={styles.itemEmoji}
                  >
                    {item.icon}
                  </Text>
                </View>

                <View style={styles.itemInfo}>
                  <Text
                    style={styles.itemName}
                  >
                    {item.name}
                  </Text>

                  <Text
                    style={styles.itemMeta}
                  >
                    {item.qty || 'Jumlah belum terdeteksi'}
                    {item.category
                      ? ` • ${item.category}`
                      : ''}
                  </Text>

                  {item.expiry ? (
                    <Text
                      style={
                        styles.expiryText
                      }
                    >
                      Kadaluarsa:{' '}
                      {formatExpiryForDisplay(
                        item.expiry
                      )}
                    </Text>
                  ) : null}

                  {item.notes ? (
                    <Text
                      style={styles.notesText}
                    >
                      {item.notes}
                    </Text>
                  ) : null}
                  <Pressable
                    style={styles.editItemButton}
                    onPress={() => startEditing(item)}
                  >
                    <Text style={styles.editItemText}>Edit bahan</Text>
                  </Pressable>
                </View>

                <View
                  style={styles.itemActions}
                >
                  <Pressable
                    style={[
                      styles.confirmButton,
                      item.confirmed &&
                        styles.confirmButtonActive,
                    ]}
                    onPress={() =>
                      toggleConfirmed(item.id)
                    }
                  >
                    <Text
                      style={[
                        styles.confirmText,
                        item.confirmed &&
                          styles.confirmTextActive,
                      ]}
                    >
                      {item.confirmed
                        ? '✓'
                        : '○'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.deleteButton}
                    onPress={() =>
                      removeItem(item.id)
                    }
                  >
                    <Text
                      style={styles.deleteText}
                    >
                      ×
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}

            {/* MANUAL ADD */}
            <Pressable
              style={styles.manualButton}
              onPress={() =>
                router.push('/manual-add')
              }
            >
              <Text
                style={styles.manualPlus}
              >
                +
              </Text>

              <View style={styles.manualInfo}>
                <Text
                  style={styles.manualTitle}
                >
                  Tambah bahan manual
                </Text>

                <Text
                  style={styles.manualText}
                >
                  Tambahkan bahan yang belum
                  terdeteksi.
                </Text>
              </View>

              <Text
                style={styles.manualArrow}
              >
                ›
              </Text>
            </Pressable>
          </ScrollView>

          {/* BOTTOM */}
          <View style={styles.bottom}>
            <Text style={styles.bottomInfo}>
              {confirmedCount} bahan siap
              ditambahkan
            </Text>

            <Pressable
              style={[
                styles.continueButton,
                confirmedCount === 0 &&
                  styles.continueButtonDisabled,
              ]}
              disabled={
                confirmedCount === 0
              }
              onPress={
                continueToStorageLife
              }
            >
              <Text
                style={
                  styles.continueButtonText
                }
              >
                Lanjutkan →
              </Text>
            </Pressable>
          </View>
        </View>

        <Modal
          visible={editingId !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingId(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Hasil Pemindaian</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.fieldLabel}>Nama bahan</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.name}
                  onChangeText={(name) => setEditForm((old) => ({ ...old, name }))}
                  placeholder="Nama bahan"
                />

                <Text style={styles.fieldLabel}>Jumlah dan satuan</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.qty}
                  onChangeText={(qty) => setEditForm((old) => ({ ...old, qty }))}
                  placeholder="Contoh: 2 bungkus"
                />

                <Text style={styles.fieldLabel}>Kategori</Text>
                <View style={styles.categoryRow}>
                  {CATEGORIES.map((category) => (
                    <Pressable
                      key={category}
                      style={[
                        styles.categoryChip,
                        editForm.category === category && styles.categoryChipSelected,
                      ]}
                      onPress={() => setEditForm((old) => ({ ...old, category }))}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          editForm.category === category && styles.categoryChipTextSelected,
                        ]}
                      >
                        {category}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Tanggal kedaluwarsa (opsional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.expiry}
                  onChangeText={(expiry) => setEditForm((old) => ({ ...old, expiry }))}
                  placeholder="YYYY-MM-DD"
                />

                <Text style={styles.fieldLabel}>Catatan (opsional)</Text>
                <TextInput
                  style={[styles.fieldInput, styles.notesInput]}
                  value={editForm.notes}
                  onChangeText={(notes) => setEditForm((old) => ({ ...old, notes }))}
                  placeholder="Tambahkan catatan"
                  multiline
                />
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelEditButton}
                  onPress={() => setEditingId(null)}
                >
                  <Text style={styles.cancelEditText}>Batal</Text>
                </Pressable>
                <Pressable style={styles.saveEditButton} onPress={saveEdit}>
                  <Text style={styles.saveEditText}>Simpan</Text>
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

  container: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFEC',
  },

  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },

  backText: {
    fontSize: 27,
    color: '#303630',
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#232823',
  },

  subtitle: {
    fontSize: 10,
    color: '#8A918B',
    marginTop: 2,
  },

  badge: {
    backgroundColor: '#E5F3E8',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },

  badgeText: {
    fontSize: 10,
    color: '#2F7556',
    fontWeight: '700',
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 130,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E6E2',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 14,
  },

  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E6F3E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  emptyIconText: {
    fontSize: 24,
    color: '#2F7556',
    fontWeight: '600',
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#252A25',
  },

  emptyText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#8A918B',
    textAlign: 'center',
    marginTop: 5,
  },

  itemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E5E1',
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  itemCardConfirmed: {
    borderColor: '#A8CDB8',
  },

  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  itemEmoji: {
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
    fontSize: 11,
    color: '#7A827B',
    marginTop: 3,
  },

  expiryText: {
    fontSize: 10,
    color: '#D76B3F',
    marginTop: 4,
  },

  notesText: {
    fontSize: 10,
    color: '#929993',
    marginTop: 3,
  },

  itemActions: {
    alignItems: 'center',
    gap: 7,
    marginLeft: 8,
  },

  confirmButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#CDD3CE',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  confirmButtonActive: {
    backgroundColor: '#2F7556',
    borderColor: '#2F7556',
  },

  confirmText: {
    fontSize: 16,
    color: '#929993',
  },

  confirmTextActive: {
    color: '#FFFFFF',
  },

  deleteButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteText: {
    fontSize: 20,
    color: '#C1C6C2',
  },

  manualButton: {
    minHeight: 68,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE2DD',
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  manualPlus: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E5F3E8',
    textAlign: 'center',
    lineHeight: 34,
    fontSize: 20,
    color: '#2F7556',
    marginRight: 11,
  },

  manualInfo: {
    flex: 1,
  },

  manualTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#292E29',
  },

  manualText: {
    fontSize: 10,
    color: '#8A918B',
    marginTop: 3,
  },

  manualArrow: {
    fontSize: 24,
    color: '#7A837C',
  },

  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FAFBF9',
    borderTopWidth: 1,
    borderTopColor: '#E4E7E4',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },

  bottomInfo: {
    fontSize: 10,
    color: '#868E87',
    textAlign: 'center',
    marginBottom: 8,
  },

  continueButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#2F7556',
    alignItems: 'center',
    justifyContent: 'center',
  },

  continueButtonDisabled: {
    backgroundColor: '#CBD5CE',
  },

  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  ocrInfoCard: {
    backgroundColor: '#F0F6F2',
    borderRadius: 11,
    padding: 12,
    marginBottom: 14,
  },
  ocrInfoText: {
    fontSize: 10,
    lineHeight: 16,
    color: '#3B684F',
  },
  editItemButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
  },
  editItemText: {
    color: '#2F7556',
    fontSize: 11,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#252A25',
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#48544B',
    marginBottom: 6,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#DCE3DD',
    backgroundColor: '#FAFBF9',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#252A25',
    fontSize: 13,
    marginBottom: 14,
  },
  notesInput: {
    minHeight: 65,
    textAlignVertical: 'top',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 14,
  },
  categoryChip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE3DD',
    backgroundColor: '#FFFFFF',
  },
  categoryChipSelected: {
    backgroundColor: '#E5F3E8',
    borderColor: '#2F7556',
  },
  categoryChipText: {
    color: '#6B766D',
    fontSize: 11,
  },
  categoryChipTextSelected: {
    color: '#2F7556',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  cancelEditButton: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 13,
    backgroundColor: '#F0F2F0',
    alignItems: 'center',
  },
  cancelEditText: {
    fontSize: 12,
    color: '#4E5B51',
    fontWeight: '700',
  },
  saveEditButton: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 13,
    backgroundColor: '#2F7556',
    alignItems: 'center',
  },
  saveEditText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});