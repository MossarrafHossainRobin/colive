export default function ConfirmDialog({ open, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-[#050505]">{title}</h3>
        <p className="mt-2 text-sm text-[#65676B]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full bg-[#E4E6EB] px-4 py-2 text-sm font-semibold text-[#050505]">{cancelText}</button>
          <button type="button" onClick={onConfirm} className="rounded-full bg-[#0084FF] px-4 py-2 text-sm font-semibold text-white">{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
