import {
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';

type CapturedPhoto = {
  uri: string;
};

type ReceiptItem = {
  id: string;
  name: string;
  qty: string;
  category: string;
  expiry: string;
  notes: string;
  confirmed: boolean;
};

// OCR.space Free membatasi ukuran file gambar hingga 1,5 MB.
// Gunakan batas aman 1,3 MB (ukuran biner JPEG, bukan panjang Base64).
const MAX_OCR_IMAGE_BYTES = 1_300_000;

function base64ByteLength(base64: string): number {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const padding = (clean.match(/=+$/)?.[0]?.length ?? 0);
  return Math.floor((clean.length * 3) / 4) - padding;
}

async function compressPhotoForOCR(uri: string): Promise<string> {
  // Coba kualitas/resolusi tinggi dulu agar huruf tetap terbaca.
  // Turunkan hanya bila ukuran masih melewati batas OCR.space.
  const attempts = [
    { width: 1800, quality: 0.78 },
    { width: 1600, quality: 0.68 },
    { width: 1400, quality: 0.58 },
    { width: 1200, quality: 0.48 },
    { width: 1000, quality: 0.40 },
    { width: 800, quality: 0.32 },
  ];

  for (const attempt of attempts) {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: attempt.width });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: attempt.quality,
      format: SaveFormat.JPEG,
      base64: true,
    });

    if (!saved.base64) {
      throw new Error('Gagal membaca hasil kompresi foto.');
    }

    const bytes = base64ByteLength(saved.base64);
    console.log(`Foto OCR: ${(bytes / 1_000_000).toFixed(2)} MB`);

    if (bytes <= MAX_OCR_IMAGE_BYTES) {
      return `data:image/jpeg;base64,${saved.base64}`;
    }
  }

  throw new Error(
    'Foto masih terlalu besar untuk OCR. Coba foto ulang lebih dekat ke struk.'
  );
}

// Baca hasil OCR menjadi produk, jumlah, dan kategori.
// OCR membaca teks; klasifikasi ini memakai aturan kata kunci,
// sehingga pengguna tetap perlu memeriksa hasil di Konfirmasi.
function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

const CATEGORY_KEYWORDS: { category: string; pattern: RegExp }[] = [
  {
    category: 'Sayur',
    pattern: /\b(bayam|kangkung|sawi|pakcoy|pokcoy|bok\s*choy|brokoli|wortel|kentang|tomat|timun|mentimun|selada|kubis|kol|buncis|terong|tauge|taoge|labu|seledri|daun\s*bawang|daun\s*singkong|daun\s*jeruk|cabai|cabe|bawang\s*(merah|putih|bombai)|jamur|sayur|spinach|carrot|cabbage|lettuce|cucumber|mushroom|chili)\b/i,
  },
  {
    category: 'Buah',
    pattern: /\b(apel|pisang|jeruk|mangga|anggur|semangka|melon|pepaya|nanas|stroberi|strawberry|blueberry|raspberry|alpukat|avokad|avocado|pir|kiwi|lemon|limau|lime|buah\s*naga|salak|rambutan|durian|jambu|kelengkeng|lengkeng|kurma|apple|banana|orange|grape|watermelon|papaya|pineapple)\b/i,
  },
  {
    category: 'Susu',
    pattern: /\b(susu|milk|uht|yoghurt|yogurt|keju|cheese|mentega|butter|krim\s*susu|cream\s*cheese|susu\s*kental|susu\s*bubuk)\b/i,
  },
  {
    category: 'Daging',
    pattern: /\b(daging|ayam|sapi|kambing|bebek|ikan|udang|cumi|salmon|tuna|tongkol|lele|nila|bandeng|sarden|sardine|seafood|bakso|sosis|nugget|steak|beef|chicken|fish|shrimp|prawn|meat|fillet|hati\s*ayam)\b/i,
  },
  {
    category: 'Cairan',
    pattern: /\b(air\s*mineral|air\s*putih|air\s*kelapa|jus|juice|sirup|syrup|teh|tea|kopi|coffee|soda|soft\s*drink|minuman|isotonik|mineral\s*water|sparkling\s*water|kecap|saus|sauce|cuka|vinegar|minyak\s*goreng|cooking\s*oil)\b/i,
  },
];

function detectCategory(name: string): string {
  for (const item of CATEGORY_KEYWORDS) {
    if (item.pattern.test(name)) return item.category;
  }
  return 'Lainnya';
}

const UNIT_PATTERN =
  '(?:bungkus|bks|pack|pak|pcs|pc|buah|butir|ikat|botol|btl|kotak|box|kaleng|sachet|saset|dus|kg|kilogram|gram|gr|g|liter|ltr|l|ml)';

function normalizeUnit(unit: string): string {
  const value = unit.toLowerCase();
  const names: Record<string, string> = {
    bks: 'bungkus', pack: 'bungkus', pak: 'bungkus',
    pcs: 'pcs', pc: 'pcs', btl: 'botol', box: 'kotak',
    saset: 'sachet', kilogram: 'kg', gr: 'gram', g: 'gram',
    ltr: 'liter', l: 'liter',
  };
  return names[value] || value;
}

function looksLikeReceiptNoise(line: string): boolean {
  if (!line || !/[A-Za-z]/.test(line)) return true;
  if (/^[-=_*~.\s]{3,}$/.test(line)) return true;
  if (/^(?:toko|pt\.?|cv\.?|supermarket|indomaret|alfamart|hypermart|transmart|superindo|lottemart|ranch\s*market|farmers\s*market)\b/i.test(line)) return true;
  if (/^(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{2}:\d{2})\b/.test(line)) return true;

  // Gunakan awalan kata, bukan .includes(), agar nama produk
  // yang kebetulan mengandung kata lain tidak ikut terbuang.
  if (/^(?:sub\s*total|grand\s*total|total|cash|tunai|change|kembalian|tax|pajak|ppn|discount|diskon|receipt|struk|thank\s*you|terima\s*kasih|telp|telepon|phone|tanggal|date|waktu|time|kasir|cashier|payment|pembayaran|visa|mastercard|debit|credit|harga|price|amount|qty|jumlah|alamat|jalan|jl\.?|npwp|invoice|no\.?\s*transaksi|no\.?\s*struk|metode\s*bayar)\b/i.test(line)) {
    return true;
  }

  // Abaikan baris yang hanya memuat kode/barcode dan angka.
  if (/^[\d\s.,:/#-]+$/.test(line)) return true;
  return false;
}

function removeTrailingPrice(line: string): string {
  let result = line;
  // Contoh: BAYAM 2 BKS 12.500, SUSU UHT Rp 18000
  result = result.replace(/\s+(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\s*$/i, '');
  result = result.replace(/\s+rp\.?\s*\d+(?:[.,]\d+)?\s*$/i, '');
  result = result.replace(/\s+\d{4,}(?:[.,]\d{2})?\s*$/, '');
  return result.trim();
}

function parseProductLine(line: string): { name: string; qty: string } | null {
  let name = removeTrailingPrice(cleanLine(line))
    .replace(/^[*#-]+\s*/, '')
    .replace(/\s+[*#-]+$/, '')
    .trim();
  if (!name || looksLikeReceiptNoise(name)) return null;

  let qty = '';
  let match: RegExpMatchArray | null;

  // "2 x BAYAM", "2x BAYAM", "2 BKS BAYAM"
  match = name.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*[xX×]\\s+(.+)$`, 'i'));
  if (match) {
    qty = match[1].replace(',', '.');
    name = match[2];
  } else {
    match = name.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})\\s+(.+)$`, 'i'));
    if (match) {
      qty = `${match[1].replace(',', '.')} ${normalizeUnit(match[2])}`;
      name = match[3];
    } else {
      // "BAYAM 2 BKS", "TELUR 10 BUTIR", "SUSU UHT 1L"
      match = name.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})$`, 'i'));
      if (match) {
        name = match[1];
        qty = `${match[2].replace(',', '.')} ${normalizeUnit(match[3])}`;
      } else {
        // "BAYAM x2"
        match = name.match(/^(.+?)\s+[xX×]\s*(\d+)$/);
        if (match) {
          name = match[1];
          qty = match[2];
        }
      }
    }
  }

  name = name.replace(/\s{2,}/g, ' ').trim();
  if (name.length < 3 || !/[A-Za-z]{2}/.test(name)) return null;

  // Hindari item yang ternyata cuma label pembayaran.
  if (looksLikeReceiptNoise(name)) return null;

  // Pertahankan singkatan populer ketika OCR menulis semua huruf kapital.
  if (name === name.toUpperCase()) {
    name = name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .replace(/\bUht\b/g, 'UHT')
      .replace(/\bAbc\b/g, 'ABC');
  }

  return { name, qty };
}

function parseReceiptText(text: string): ReceiptItem[] {
  const rawLines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const products: { name: string; qty: string }[] = [];
  const seen = new Set<string>();

  for (const line of rawLines) {
    const parsed = parseProductLine(line);
    if (!parsed) continue;
    const key = `${parsed.name.toLowerCase()}|${parsed.qty.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    products.push(parsed);
    if (products.length >= 20) break;
  }

  return products.map((product, index): ReceiptItem => ({
    id: `ocr-${Date.now()}-${index}`,
    name: product.name,
    qty: product.qty, // kosong jika jumlah tidak terbaca; koreksi di Konfirmasi
    category: detectCategory(product.name),
    expiry: '', // struk umumnya tidak memuat tanggal kedaluwarsa
    notes: '',
    confirmed: true,
  }));
}

export default function ScannerScreen() {
  const [
    permission,
    requestPermission,
  ] =
    useCameraPermissions();

  const cameraRef =
    useRef<CameraView | null>(
      null
    );

  const [cameraActive, setCameraActive] =
    useState(true);

  const [
    photo,
    setPhoto,
  ] =
    useState<CapturedPhoto | null>(
      null
    );

  const [
    takingPhoto,
    setTakingPhoto,
  ] = useState(false);

  const [
    processingOCR,
    setProcessingOCR,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  useFocusEffect(
    useCallback(() => {
      setCameraActive(true);

      return () => {
        setCameraActive(false);
      };
    }, [])
  );

  async function takePhoto() {
    if (
      !cameraRef.current ||
      takingPhoto
    ) {
      return;
    }

    try {
      setTakingPhoto(true);
      setErrorMessage('');

      const result =
        await cameraRef.current.takePictureAsync(
          {
            quality: 0.85,
          }
        );

      if (!result) {
        setErrorMessage(
          'Foto gagal diambil.'
        );
        return;
      }

      setPhoto({ uri: result.uri });

      setCameraActive(false);
    } catch (error) {
      console.error(
        'Take photo error:',
        error
      );

      setErrorMessage(
        'Gagal mengambil foto.'
      );
    } finally {
      setTakingPhoto(false);
    }
  }

  function retakePhoto() {
    setPhoto(null);
    setErrorMessage('');
    setCameraActive(true);
  }

  async function processReceipt() {
    if (
      !photo ||
      processingOCR
    ) {
      return;
    }

    try {
      setProcessingOCR(true);
      setErrorMessage('');

      // Kompres otomatis agar foto tidak ditolak OCR.space (E556).
      const imageBase64 = await compressPhotoForOCR(photo.uri);

      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          'receipt-ocr',
          {
            body: {
              imageBase64,
            },
          }
        );

      if (error) {
        console.error(
          'OCR function error:',
          error
        );

        let serverMessage = '';
        try {
          // Supabase FunctionsHttpError menyediakan Response di context.
          const context = (error as { context?: Response }).context;
          if (context && typeof context.json === 'function') {
            const payload = await context.json();
            serverMessage = typeof payload?.error === 'string'
              ? payload.error
              : typeof payload?.message === 'string'
                ? payload.message
                : '';
          }
        } catch {
          // Tetap tampilkan pesan umum jika respons tidak berbentuk JSON.
        }

        const isTooLarge = /E556|too large|1\.5\s*MB/i.test(serverMessage);
        setErrorMessage(
          isTooLarge
            ? 'Ukuran foto masih terlalu besar. Coba foto ulang dengan lebih dekat.'
            : 'Layanan OCR gagal memproses foto. Periksa log receipt-ocr di Supabase.'
        );

        return;
      }

      if (data?.error) {
        console.error(
          'OCR response error:',
          data.error
        );

        setErrorMessage(
          data.error
        );

        return;
      }

      const rawText =
        typeof data?.text ===
        'string'
          ? data.text.trim()
          : '';

      if (!rawText) {
        setErrorMessage(
          'Tidak ada teks yang berhasil dibaca dari struk.'
        );

        return;
      }

      const parsedItems =
        parseReceiptText(
          rawText
        );

      if (
        parsedItems.length === 0
      ) {
        setErrorMessage(
          'Teks struk terbaca, tetapi belum ada nama barang yang berhasil dikenali.'
        );

        return;
      }

      router.push({
        pathname:
          '/confirmation',

        params: {
          items:
            JSON.stringify(
              parsedItems
            ),

          /*
            Kita kirim juga raw OCR
            kalau nanti perlu debugging.
          */
          ocrText:
            rawText,
        },
      });
    } catch (error) {
      console.error(
        'Process OCR error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat memproses struk.'
      );
    } finally {
      setProcessingOCR(false);
    }
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  if (!permission) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={
            styles.centerContent
          }
        >
          <ActivityIndicator
            color="#2F7556"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.phone}
        >
          <View
            style={
              styles.permissionContainer
            }
          >
            <Text
              style={
                styles.permissionIcon
              }
            >
              📷
            </Text>

            <Text
              style={
                styles.permissionTitle
              }
            >
              Izinkan Kamera
            </Text>

            <Text
              style={
                styles.permissionText
              }
            >
              IsiKulkas membutuhkan
              akses kamera untuk
              memindai struk belanja.
            </Text>

            <Pressable
              style={
                styles.permissionButton
              }
              onPress={
                requestPermission
              }
            >
              <Text
                style={
                  styles.permissionButtonText
                }
              >
                Izinkan Kamera
              </Text>
            </Pressable>

            <Pressable
              style={
                styles.cancelPermission
              }
              onPress={handleBack}
            >
              <Text
                style={
                  styles.cancelPermissionText
                }
              >
                Kembali
              </Text>
            </Pressable>
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
            Pindai Struk
          </Text>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <View
          style={styles.content}
        >
          <Text
            style={styles.title}
          >
            {photo
              ? 'Periksa foto struk'
              : 'Arahkan kamera ke struk'}
          </Text>

          <Text
            style={
              styles.description
            }
          >
            {photo
              ? 'Pastikan tulisan pada struk terlihat jelas sebelum diproses.'
              : 'Pastikan seluruh struk terlihat dan pencahayaan cukup terang.'}
          </Text>
<View
            style={
              styles.cameraContainer
            }
          >
            {photo ? (
              <Image
                source={{
                  uri: photo.uri,
                }}
                style={
                  styles.previewImage
                }
                resizeMode="cover"
              />
            ) : cameraActive ? (
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
              />
            ) : (
              <View
                style={
                  styles.cameraPlaceholder
                }
              />
            )}

            {!photo ? (
              <View
                pointerEvents="none"
                style={
                  styles.scanFrame
                }
              >
                <View
                  style={[
                    styles.corner,
                    styles.cornerTL,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.cornerTR,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.cornerBL,
                  ]}
                />

                <View
                  style={[
                    styles.corner,
                    styles.cornerBR,
                  ]}
                />
              </View>
            ) : null}

            {processingOCR ? (
              <View
                style={
                  styles.processingOverlay
                }
              >
                <ActivityIndicator
                  size="large"
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.processingTitle
                  }
                >
                  Membaca struk...
                </Text>

                <Text
                  style={
                    styles.processingText
                  }
                >
                  IsiKulkas sedang
                  mengenali barang dari
                  foto.
                </Text>
              </View>
            ) : null}
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

          {!photo ? (
            <>
              <Pressable
                style={[
                  styles.captureButton,

                  takingPhoto &&
                    styles.disabledButton,
                ]}
                onPress={takePhoto}
                disabled={
                  takingPhoto
                }
              >
                {takingPhoto ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <>
                    <View
                      style={
                        styles.captureInner
                      }
                    />
                  </>
                )}
              </Pressable>

              <Text
                style={
                  styles.helperText
                }
              >
                Tekan tombol untuk
                mengambil foto
              </Text>
            </>
          ) : (
            <View
              style={
                styles.previewActions
              }
            >
              <Pressable
                style={
                  styles.retakeButton
                }
                onPress={
                  retakePhoto
                }
                disabled={
                  processingOCR
                }
              >
                <Text
                  style={
                    styles.retakeButtonText
                  }
                >
                  Foto Ulang
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.useButton,

                  processingOCR &&
                    styles.disabledButton,
                ]}
                onPress={
                  processReceipt
                }
                disabled={
                  processingOCR
                }
              >
                {processingOCR ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.useButtonText
                    }
                  >
                    Gunakan Foto →
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          <View
            style={styles.tipBox}
          >
            <Text
              style={styles.tipTitle}
            >
              Tips
            </Text>

            <Text
              style={styles.tipText}
            >
              • Letakkan struk di
              permukaan datar
              {'\n'}• Hindari bayangan
              pada tulisan
              {'\n'}• Pastikan nama
              barang tidak blur
            </Text>
          </View>
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

    header: {
      height: 70,
      paddingHorizontal: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
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
      fontSize: 17,
      fontWeight: '700',
      color: '#252A25',
    },

    headerSpacer: {
      width: 38,
    },

    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingBottom: 28,
    },

    title: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      color: '#252A25',
      marginTop: 8,
    },

    description: {
      fontSize: 11,
      lineHeight: 17,
      color: '#7E867F',
      marginTop: 6,
      marginBottom: 18,
    },

    cameraContainer: {
      width: '100%',
      aspectRatio: 0.78,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: '#232823',
      position: 'relative',
    },

    camera: {
      flex: 1,
    },

    cameraPlaceholder: {
      flex: 1,
      backgroundColor: '#252A25',
    },

    previewImage: {
      width: '100%',
      height: '100%',
    },

    scanFrame: {
      position: 'absolute',
      top: 25,
      left: 25,
      right: 25,
      bottom: 25,
    },

    corner: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderColor: '#FFFFFF',
    },

    cornerTL: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 9,
    },

    cornerTR: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 9,
    },

    cornerBL: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 9,
    },

    cornerBR: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 9,
    },

    processingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor:
        'rgba(27, 35, 29, 0.72)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 35,
    },

    processingTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
      marginTop: 13,
    },

    processingText: {
      fontSize: 10,
      lineHeight: 16,
      color:
        'rgba(255,255,255,0.82)',
      textAlign: 'center',
      marginTop: 5,
    },

    captureButton: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: '#2F7556',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginTop: 20,
      borderWidth: 5,
      borderColor: '#D9E8DF',
    },

    captureInner: {
      width: 45,
      height: 45,
      borderRadius: 23,
      backgroundColor: '#FFFFFF',
    },

    helperText: {
      fontSize: 9,
      color: '#939A94',
      textAlign: 'center',
      marginTop: 7,
    },

    previewActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },

    retakeButton: {
      flex: 1,
      height: 50,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#DCE1DC',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },

    retakeButtonText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#59625A',
    },

    useButton: {
      flex: 1.4,
      height: 50,
      borderRadius: 10,
      backgroundColor: '#2F7556',
      alignItems: 'center',
      justifyContent: 'center',
    },

    useButtonText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },

    disabledButton: {
      opacity: 0.6,
    },

    tipBox: {
      backgroundColor: '#F0F5F1',
      borderRadius: 11,
      padding: 13,
      marginTop: 16,
    },

    tipTitle: {
      fontSize: 10,
      fontWeight: '700',
      color: '#3B684F',
    },

    tipText: {
      fontSize: 9,
      lineHeight: 15,
      color: '#6C776E',
      marginTop: 4,
    },

    errorBox: {
      backgroundColor: '#FCEAE7',
      borderRadius: 10,
      padding: 11,
      marginTop: 13,
    },

    errorText: {
      fontSize: 10,
      lineHeight: 15,
      color: '#B95242',
    },

    permissionContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 35,
    },

    permissionIcon: {
      fontSize: 45,
      marginBottom: 15,
    },

    permissionTitle: {
      fontSize: 21,
      fontWeight: '700',
      color: '#252A25',
    },

    permissionText: {
      fontSize: 11,
      lineHeight: 18,
      color: '#7E867F',
      textAlign: 'center',
      marginTop: 7,
    },

    permissionButton: {
      width: '100%',
      height: 50,
      borderRadius: 10,
      backgroundColor: '#2F7556',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 22,
    },

    permissionButtonText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    cancelPermission: {
      marginTop: 12,
      padding: 10,
    },

    cancelPermissionText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#767E77',
    },

    centerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });