import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId: string) => `inbox_category_views_${userId}`;

type ViewMap = Record<string, number>;

export const getCategoryViews = async (userId: string): Promise<ViewMap> => {
  if (!userId) return {};
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const markCategoryViewed = async (userId: string, categoryKey: string): Promise<ViewMap> => {
  if (!userId) return {};
  try {
    const current = await getCategoryViews(userId);
    const next = { ...current, [categoryKey]: Date.now() };
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next));
    return next;
  } catch {
    return {};
  }
};
