import { api } from "./client";

export interface ExportResult {
  filename: string;
  sizeBytes: number;
  exportedAt: number;
  /** Base64-encoded raw SQLite file bytes. */
  data: string;
}

export interface ImportSummary {
  restoredAt: number;
  tables: Record<string, number>;
}

export const backupApi = {
  export: () => api.get<ExportResult>("/backup/export"),
  import: (data: string, criticalConfirmation: string) =>
    api.post<ImportSummary>("/backup/import", { data, criticalConfirmation }),
};

/** Decodes the base64 payload from export() and triggers a browser download. */
export function downloadExport(result: ExportResult) {
  const binary = atob(result.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Reads a File selected via <input type="file"> and returns it as base64. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string; // "data:application/octet-stream;base64,AAAA..."
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}
