import { supabase } from "@/lib/supabase";
import { useEffect } from "react";
import { View, Text } from "react-native";

export default function HomeScreen() {

  useEffect(() => {
    const testConnection = async () => {
      const { data, error } = await supabase.auth.getSession();

      console.log("Session:", data);
      console.log("Error:", error);
    };

    testConnection();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Hello, DealDrop 👋</Text>
    </View>
  );
}
