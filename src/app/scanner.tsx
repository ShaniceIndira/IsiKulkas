import {
  CameraView,
  useCameraPermissions,
} from 'expo-camera';
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
  base64?: string | null;
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

function cleanLine(line: string) {
  return line
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeReceiptNoise(
  line: string
) {
  const lower =
    line.toLowerCase();

  const noiseWords = [
    'total',
    'subtotal',
    'grand total',
    'cash',
    'tunai',
    'change',
    'kembalian',
    'tax',
    'pajak',
    'ppn',
    'discount',
    'diskon',
    'receipt',
    'struk',
    'thank you',
    'terima kasih',
    'telp',
    'phone',
    'date',
    'tanggal',
    'time',
    'waktu',
    'cashier',
    'kasir',
    'payment',
    'pembayaran',
    'visa',
    'mastercard',
    'debit',
    'credit',
    'qty',
    'harga',
    'price',
    'amount',
  ];

  if (
    noiseWords.some((word) =>
      lower.includes(word)
    )
  ) {
    return true;
  }

  /*
    Buang baris yang hampir semuanya
    angka / simbol / nominal harga.
  */
  const letters =
    line.match(/[A-Za-z]/g)
      ?.length || 0;

  if (letters < 2) {
    return true;
  }

  return false;
}

function extractProductName(
  line: string
) {
  let value = cleanLine(line);

  /*
    Hapus nominal harga di ujung.
    Contoh:
    "SUSU UHT 1L 18.500"
    menjadi
    "SUSU UHT 1L"
  */
  value = value.replace(
    /\s+(?:rp\s*)?[\d.,]+(?:\s*)$/i,
    ''
  );

  /*
    Hapus pola jumlah/harga yang umum
    di bagian awal.
  */
  value = value.replace(
    /^\d+\s*[xX]\s*/i,
    ''
  );

  value = value.replace(
    /^\d+\s+/,
    ''
  );

  return value.trim();
}

function parseReceiptText(
  text: string
): ReceiptItem[] {
  const rawLines =
    text
      .split(/\r?\n/)
      .map(cleanLine)
      .filter(Boolean);

  const candidates =
    rawLines
      .filter(
        (line) =>
          !looksLikeReceiptNoise(
            line
          )
      )
      .map(extractProductName)
      .filter(
        (line) =>
          line.length >= 3
      );

  /*
    Hapus duplicate hasil OCR.
  */
  const unique: string[] = [];

  for (const line of candidates) {
    const normalized =
      line.toLowerCase();

    if (
      !unique.some(
        (existing) =>
          existing.toLowerCase() ===
          normalized
      )
    ) {
      unique.push(line);
    }
  }

  /*
    Supaya hasil OCR yang buruk tidak
    membuat puluhan item aneh.
  */
  return unique
    .slice(0, 20)
    .map(
      (
        name,
        index
      ): ReceiptItem => ({
        id: `ocr-${Date.now()}-${index}`,
        name,
        qty: '',
        category: 'Lainnya',
        expiry: '',
        notes: '',
        confirmed: true,
      })
    );
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
            quality: 0.7,
            base64: true,
          }
        );

      if (!result) {
        setErrorMessage(
          'Foto gagal diambil.'
        );
        return;
      }

      setPhoto({
        uri: result.uri,
        base64:
          result.base64 || null,
      });

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

      if (!photo.base64) {
        setErrorMessage(
          'Data foto tidak tersedia untuk OCR. Coba ambil foto ulang.'
        );
        return;
      }

      /*
        OCR.Space butuh base64 image
        dengan prefix data:image/...
      */
      const imageBase64 =
        photo.base64.startsWith(
          'data:image'
        )
          ? photo.base64
          : `data:image/jpeg;base64,${photo.base64}`;

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

        setErrorMessage(
          'OCR gagal membaca struk. Coba foto ulang dengan gambar yang lebih jelas.'
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

      console.log(
        'OCR RAW TEXT:',
        rawText
      );

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
        'Terjadi kesalahan saat memproses struk.'
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