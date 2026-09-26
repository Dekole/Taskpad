import { useState, useRef } from "react";
import { X, Upload, AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { API_BASE } from "../lib/utils";

export function CsvImportModal({ userId, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/import/csv?user_id=${userId}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Import failed.");
      } else {
        setResult(data);
        if (data.imported > 0) onImported();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Import Tasks from CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Instructions */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="font-medium text-gray-600">Expected CSV columns:</p>
            <p className="font-mono text-gray-400 break-all">
              title, category, due_date, status, order, last_modified, never_stale
            </p>
            <p className="mt-1">
              Only <span className="font-medium text-gray-700">title</span> is required. Export
              your Google Sheet as CSV (File → Download → CSV) and upload it here.
            </p>
          </div>

          {/* File picker */}
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <Upload size={20} className="mx-auto mb-2 text-gray-400" />
            {file ? (
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
            ) : (
              <p className="text-sm text-gray-400">Click to select a .csv file</p>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                <CheckCircle size={15} className="shrink-0" />
                <span>
                  Imported {result.imported} task{result.imported !== 1 ? "s" : ""}
                  {result.skipped > 0 ? `, skipped ${result.skipped}` : ""}.
                </span>
              </div>
              {result.warnings.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!file || loading}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Importing..." : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
