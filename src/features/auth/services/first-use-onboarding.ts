import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_PREFIX = "dealdrop:first-use-onboarding:";

export async function markFirstUseOnboardingPending(userId: string) {
  try {
    await AsyncStorage.setItem(getStorageKey(userId), "pending");
  } catch (error) {
    console.warn("First-use onboarding preference could not be saved", error);
  }
}

export async function consumeFirstUseOnboarding(userId: string) {
  try {
    const pending = await AsyncStorage.getItem(getStorageKey(userId));
    if (pending !== "pending") {
      return false;
    }

    await AsyncStorage.removeItem(getStorageKey(userId));
    return true;
  } catch (error) {
    console.warn("First-use onboarding preference could not be loaded", error);
    return false;
  }
}

export async function clearFirstUseOnboarding(userId: string) {
  try {
    await AsyncStorage.removeItem(getStorageKey(userId));
  } catch (error) {
    console.warn("First-use onboarding preference could not be cleared", error);
  }
}

function getStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}
