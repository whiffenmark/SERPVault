import Papa from 'papaparse';

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  error?: string;
}

export function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? [];
        const rows = (results.data as Record<string, string>[]).map((row) => {
          const cleaned: Record<string, string> = {};
          for (const key of headers) {
            cleaned[key] = String(row[key] ?? '').trim();
          }
          return cleaned;
        });
        resolve({ headers, rows });
      },
      error(err) {
        resolve({ headers: [], rows: [], error: err.message });
      },
    });
  });
}
