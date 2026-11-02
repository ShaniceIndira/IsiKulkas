import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL belum tersedia.'
  );
}

if (!supabaseKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_KEY belum tersedia.'
  );
}

/*
  Expo Router bisa menjalankan file ini di server
  ketika menggunakan web.

  Karena itu kita tidak boleh langsung mengakses
  window/localStorage saat server rendering.
*/
const webStorage =
  typeof window !== 'undefined'
    ? window.localStorage
    : undefined;

const authStorage =
  Platform.OS === 'web'
    ? webStorage
    : AsyncStorage;

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,

      /*
        Session hanya disimpan ketika storage
        memang tersedia.
      */
      persistSession:
        Platform.OS !== 'web' ||
        typeof window !== 'undefined',

      detectSessionInUrl: false,
    },
  }
);