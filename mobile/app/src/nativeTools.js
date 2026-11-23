import Geolocation from '@react-native-community/geolocation';
import { Platform } from 'react-native';
import { PERMISSIONS, request, requestMultiple, RESULTS } from 'react-native-permissions';
import Share from 'react-native-share';

export async function requestCamera() {
  const permission = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
  if (await request(permission) !== RESULTS.GRANTED) {
    throw new Error('Allow camera access in Settings to continue.');
  }
}

export async function currentLocation() {
  const fine = PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;
  const permission = Platform.OS === 'ios' ? await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE) :
    (await requestMultiple([PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION, fine]))[fine];
  if (permission !== RESULTS.GRANTED) {
    throw new Error('Allow precise location access in Settings to continue.');
  }
  Geolocation.setRNConfiguration({ skipPermissionRequests: true, authorizationLevel: 'whenInUse' });
  return new Promise((resolve, reject) => Geolocation.getCurrentPosition(resolve, error =>
    reject(new Error(error.message || 'A fresh location reading is unavailable.')), {
    enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
  }));
}

export function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

export async function shareDocument(response, filename, type) {
  const blob = await response.blob();
  try {
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The phone could not read the document.'));
      reader.readAsDataURL(blob);
    });
    const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'text/csv': 'csv' }[type];
    const dataUrl = `data:${type};base64,${url.slice(url.indexOf(',') + 1)}`;
    await Share.open({
      url: dataUrl,
      type,
      filename: Platform.OS === 'ios' ? `${filename}.${extension}` : filename,
      useInternalStorage: true,
      failOnCancel: false,
    });
  } finally {
    blob.close?.();
  }
}
