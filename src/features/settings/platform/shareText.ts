import { Share } from 'react-native';

export async function shareText(title: string, message: string): Promise<boolean> {
  try {
    await Share.share({ title, message }, { dialogTitle: title });
    return true;
  } catch {
    return false;
  }
}
