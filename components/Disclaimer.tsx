export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 ${className}`}
      role="note"
    >
      <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 flex-none fill-sky-600" aria-hidden="true">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM11.2 14.5H8.8v-1.2h.6V10h-.6V8.8h1.8v4.5h.6v1.2Z" />
      </svg>
      <p>
        <strong className="font-semibold">Educational information, not medical advice.</strong> This plan is
        written by AI to help you understand your injury and talk with your doctor or physical therapist. It may
        contain mistakes and doesn&apos;t know the details of your exam or imaging. Follow your care team&apos;s
        instructions first.
      </p>
    </div>
  );
}
