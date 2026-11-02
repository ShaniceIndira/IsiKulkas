import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NOTIFICATION_PREFIX =
  'expiryNotification:';

function parseISODate(value: string) {
  const [year, month, day] =
    value.split('-').map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}

function getStorageKey(
  itemId: string
) {
  return `${NOTIFICATION_PREFIX}${itemId}`;
}

export async function requestNotificationPermission() {
  if (Platform.OS === 'web') {
    return false;
  }

  const current =
    await Notifications.getPermissionsAsync();

  if (
    current.status === 'granted'
  ) {
    return true;
  }

  const result =
    await Notifications.requestPermissionsAsync();

  return result.status === 'granted';
}

export async function cancelExpiryNotification(
  itemId: string
) {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const storageKey =
      getStorageKey(itemId);

    const notificationId =
      await AsyncStorage.getItem(
        storageKey
      );

    if (!notificationId) {
      return;
    }

    await Notifications.cancelScheduledNotificationAsync(
      notificationId
    );

    await AsyncStorage.removeItem(
      storageKey
    );
  } catch (error) {
    console.error(
      'Cancel notification error:',
      error
    );
  }
}

export async function scheduleExpiryNotification(
  itemId: string,
  itemName: string,
  expiryDate: string
) {
  if (Platform.OS === 'web') {
    return null;
  }

  /*
    Kalau item ini sebelumnya sudah
    punya reminder, hapus dulu.
  */
  await cancelExpiryNotification(
    itemId
  );

  const permissionGranted =
    await requestNotificationPermission();

  if (!permissionGranted) {
    return null;
  }

  const expiry =
    parseISODate(expiryDate);

  /*
    Reminder 1 hari sebelum expiry,
    pukul 09.00.
  */
  const reminderDate =
    new Date(expiry);

  reminderDate.setDate(
    reminderDate.getDate() - 1
  );

  reminderDate.setHours(
    9,
    0,
    0,
    0
  );

  /*
    Jangan schedule kalau waktu
    reminder sudah lewat.
  */
  if (
    reminderDate.getTime() <=
    Date.now()
  ) {
    return null;
  }

  try {
    const notificationId =
      await Notifications.scheduleNotificationAsync({
        content: {
          title:
            'Bahan hampir kadaluarsa',
          body: `${itemName} akan kadaluarsa besok.`,
          data: {
            itemId,
            type:
              'expiry-reminder',
          },
        },

        trigger: {
          type:
            Notifications.SchedulableTriggerInputTypes
              .DATE,
          date: reminderDate,
        },
      });

    /*
      Simpan notification ID secara
      lokal berdasarkan ID item.
    */
    await AsyncStorage.setItem(
      getStorageKey(itemId),
      notificationId
    );

    return notificationId;
  } catch (error) {
    console.error(
      'Schedule notification error:',
      error
    );

    return null;
  }
}

export async function cancelAllExpiryNotifications() {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const keys =
      await AsyncStorage.getAllKeys();

    const notificationKeys =
      keys.filter((key) =>
        key.startsWith(
          NOTIFICATION_PREFIX
        )
      );

    if (
      notificationKeys.length > 0
    ) {
      await AsyncStorage.multiRemove(
        notificationKeys
      );
    }
  } catch (error) {
    console.error(
      'Cancel all notifications error:',
      error
    );
  }
}