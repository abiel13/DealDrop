import { Image, View } from "react-native";

import { AppText } from "../Text";

import { AvatarProps } from "./avatar.types";

const sizes = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

export function Avatar({ uri, fallback, size = "md" }: AvatarProps) {
  if (uri) {
    return <Image source={{ uri }} className={`${sizes[size]} rounded-full`} />;
  }

  return (
    <View className={`${sizes[size]} rounded-full bg-primary items-center justify-center`}>
      <AppText className="text-white">{fallback.charAt(0).toUpperCase()}</AppText>
    </View>
  );
}
