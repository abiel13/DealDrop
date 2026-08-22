import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function shareCsvFile(filename: string, contents: string) {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("CSV sharing is not available on this device.");
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: "Share CSV file",
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
  });
}
