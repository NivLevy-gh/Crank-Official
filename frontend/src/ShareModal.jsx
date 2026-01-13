import { useEffect } from "react";

export default function ShareModal({ open, onClose, url }) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* overlay */}
      <button
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-label="Close"
      />

      {/* modal */}
      <div className="relative w-[92%] max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-neutral-900">Share link</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 text-xs text-neutral-500">
          Anyone with this link can fill the form.
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 outline-none"
          />
          <button
            onClick={copy}
            className="
              h-10 shrink-0 rounded-xl px-3 text-sm font-medium
              bg-orange-100 text-neutral-900 border border-orange-100
              hover:bg-orange-200 transition
              active:scale-[0.99]
            "
          >
            Copy
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="h-9 rounded-xl px-3 text-sm text-neutral-700 hover:bg-neutral-100 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}