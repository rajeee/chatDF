// Preset Sources modal for loading NREL ResStock parquet files.
// Hardcoded preset config: NREL ResStock 2025 Release 1, upgrade0 through upgrade32.

import { useState, useEffect, useCallback } from "react";
import { useUiStore } from "@/stores/uiStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useChatStore } from "@/stores/chatStore";
import { apiPost } from "@/api/client";

// ---------------------------------------------------------------------------
// Preset configuration
// ---------------------------------------------------------------------------

interface PresetDataset {
  name: string;
  url: string;
  filename: string;
}

interface PresetRelease {
  label: string;
  datasets: PresetDataset[];
}

interface PresetSource {
  label: string;
  releases: PresetRelease[];
}

function buildResStockDatasets(): PresetDataset[] {
  const datasets: PresetDataset[] = [];
  for (let i = 0; i <= 32; i++) {
    const filename = `upgrade${i}.parquet`;
    datasets.push({
      name: `resstock_2025_upgrade${i}`,
      url: `https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/resstock_amy2018_release_1/metadata_and_annual_results/national/full/parquet/${filename}`,
      filename,
    });
  }
  return datasets;
}

const PRESET_SOURCES: PresetSource[] = [
  {
    label: "NREL ResStock",
    releases: [
      {
        label: "ResStock 2025 Release 1",
        datasets: buildResStockDatasets(),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PresetSourcesModal() {
  const isOpen = useUiStore((s) => s.presetModalOpen);
  const closeModal = useUiStore((s) => s.closePresetModal);
  const addDataset = useDatasetStore((s) => s.addDataset);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [releaseIndex, setReleaseIndex] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const source = PRESET_SOURCES[sourceIndex];
  const release = source.releases[releaseIndex];
  const allDatasets = release.datasets;

  // Reset selection when switching source/release
  useEffect(() => {
    setSelected(new Set());
  }, [sourceIndex, releaseIndex]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        closeModal();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, isLoading, closeModal]);

  const toggleSelection = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === allDatasets.length) {
        return new Set();
      }
      return new Set(allDatasets.map((_, i) => i));
    });
  }, [allDatasets]);

  const handleLoad = useCallback(async () => {
    if (selected.size === 0) return;
    setIsLoading(true);
    setError(null);
    setLoadProgress({ current: 0, total: selected.size });

    try {
      // Create conversation if needed
      let convId = activeConversationId;
      if (!convId) {
        const newConv = await apiPost<{ id: string }>("/conversations");
        convId = newConv.id;
        setActiveConversation(convId);
      }

      const selectedIndices = Array.from(selected).sort((a, b) => a - b);
      let loaded = 0;

      for (const idx of selectedIndices) {
        const preset = allDatasets[idx];

        // Add loading placeholder to store
        const placeholderId = `preset-loading-${idx}`;
        addDataset({
          id: placeholderId,
          url: preset.url,
          name: preset.name,
          row_count: 0,
          column_count: 0,
          schema_json: "{}",
          status: "loading",
          error_message: null,
        });

        try {
          const response = await apiPost<{ dataset_id: string; status: string }>(
            `/conversations/${convId}/datasets`,
            { url: preset.url, name: preset.name }
          );

          // Update placeholder with real ID (WS event will update to "ready")
          const dsState = useDatasetStore.getState();
          dsState.updateDataset(placeholderId, { id: response.dataset_id });
        } catch (err: unknown) {
          // Update placeholder to error state
          const dsState = useDatasetStore.getState();
          const message = err instanceof Error ? err.message : "Failed to load";
          dsState.updateDataset(placeholderId, {
            status: "error",
            error_message: message,
          });
        }

        loaded++;
        setLoadProgress({ current: loaded, total: selected.size });
      }

      closeModal();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load datasets";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [selected, allDatasets, activeConversationId, addDataset, setActiveConversation, closeModal]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-sources-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) closeModal();
      }}
    >
      <div
        className="rounded-lg shadow-xl flex flex-col"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          width: 600,
          maxHeight: "80vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h2 id="preset-sources-modal-title" className="text-lg font-semibold">Preset Sources</h2>
          <button
            onClick={closeModal}
            disabled={isLoading}
            className="p-1 rounded hover:bg-gray-500/10 active:scale-90 transition-all duration-150 disabled:opacity-50"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Dropdowns */}
        <div className="flex gap-3 px-4 py-3">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs font-medium opacity-70">Data Source</span>
            <select
              value={sourceIndex}
              onChange={(e) => {
                setSourceIndex(Number(e.target.value));
                setReleaseIndex(0);
              }}
              disabled={isLoading}
              className="rounded border px-2 py-1.5 text-sm"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              {PRESET_SOURCES.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs font-medium opacity-70">Dataset</span>
            <select
              value={releaseIndex}
              onChange={(e) => setReleaseIndex(Number(e.target.value))}
              disabled={isLoading}
              className="rounded border px-2 py-1.5 text-sm"
              style={{
                backgroundColor: "var(--color-surface)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              {source.releases.map((r, i) => (
                <option key={i} value={i}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Dataset table */}
        <div className="flex-1 overflow-y-auto px-4" style={{ minHeight: 200 }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
                <th className="w-8 py-1.5 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === allDatasets.length && allDatasets.length > 0}
                    onChange={toggleSelectAll}
                    disabled={isLoading}
                    className="cursor-pointer"
                  />
                </th>
                <th className="py-1.5 text-left font-medium">Name</th>
                <th className="py-1.5 text-left font-medium">File</th>
              </tr>
            </thead>
            <tbody>
              {allDatasets.map((ds, idx) => (
                <tr
                  key={idx}
                  className="border-b cursor-pointer hover:bg-gray-500/5 transition-colors duration-150"
                  style={{ borderColor: "var(--color-border)" }}
                  onClick={() => !isLoading && toggleSelection(idx)}
                >
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleSelection(idx)}
                      disabled={isLoading}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="py-1.5">{ds.name}</td>
                  <td className="py-1.5 opacity-60">{ds.filename}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 text-sm text-red-500">{error}</div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--color-border)" }}>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selected.size === allDatasets.length && allDatasets.length > 0}
              onChange={toggleSelectAll}
              disabled={isLoading}
              className="cursor-pointer"
            />
            Select All ({allDatasets.length})
          </label>
          <button
            onClick={handleLoad}
            disabled={selected.size === 0 || isLoading}
            className="rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50 bg-accent text-white hover:brightness-110 active:scale-95 transition-all duration-150"
          >
            {isLoading
              ? `Loading ${loadProgress.current}/${loadProgress.total}...`
              : `Load (${selected.size} selected)`}
          </button>
        </div>
      </div>
    </div>
  );
}
