import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
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

export default function ConfirmationScreen() {
  const params = useLocalSearchParams<{
    manualName?: string;
    manualCategory?: string;
    manualQuantity?: string;
    manualExpiry?: string;
    manualNotes?: string;
  }>();

  const [items, setItems] = useState<FoodItem[]>([]);

  useEffect(() => {
    const manualName = params.manualName;
    const manualCategory = params.manualCategory;
    const manualQuantity = params.manualQuantity;
    const manualExpiry = params.manualExpiry;
    const manualNotes = params.manualNotes;

    if (!manualName || !manualQuantity) {
      return;
    }

    setItems((currentItems) => {
      const alreadyExists = currentItems.some(
        (item) =>
          item.name === manualName &&
          item.qty === manualQuantity &&
          item.expiry === manualExpiry
      );

      if (alreadyExists) {
        return currentItems;
      }

      const newItem: FoodItem = {
        id: `${Date.now()}-${Math.random()}`,
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
        item.id === id
          ? {
              ...item,
              confirmed: !item.confirmed,
            }
          : item
      )
    );
  }

  function removeItem(id: string) {
    setItems((currentItems) =>
      currentItems.filter(
        (item) => item.id !== id
      )
    );
  }

  const confirmedCount = items.filter(
    (item) => item.confirmed
  ).length;

  function continueToStorageLife() {
    const confirmedItems = items.filter(
      (item) => item.confirmed
    );

    router.push({
      pathname: '/storage-life',
      params: {
        items: JSON.stringify(
          confirmedItems
        ),
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
                  Tambahkan bahan secara manual
                  untuk melanjutkan.
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
                    {item.qty}
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
});