export function redirectSystemPath({ path }: { path: string | null; initial: boolean }) {
  if (!path) return "/";

  try {
    if (new URL(path).hostname === "expo-sharing") return "/share-product";
  } catch {
    return "/";
  }

  return path;
}
