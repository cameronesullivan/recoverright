export function EmergencyNotice({ reasons, onBack }: { reasons: string[]; onBack?: () => void }) {
  return (
    <section
      role="alert"
      aria-labelledby="emergency-title"
      className="rounded-2xl border-2 border-red-300 bg-red-50 p-6 text-red-950 shadow-sm sm:p-8"
    >
      <div className="flex items-start gap-3">
        <svg viewBox="0 0 24 24" className="h-8 w-8 flex-none fill-red-600" aria-hidden="true">
          <path d="M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z" />
        </svg>
        <div>
          <h2 id="emergency-title" className="text-2xl font-bold">
            Please seek medical care now
          </h2>
          <p className="mt-2 text-base">
            What you described can be a sign of a serious problem that needs to be checked right away. We&apos;re
            not going to create a plan until you&apos;ve been seen.
          </p>
        </div>
      </div>

      {reasons.length > 0 && (
        <div className="mt-5">
          <p className="font-semibold">What caught our attention:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-3 rounded-xl bg-white p-4 text-base">
        <p>
          <strong>Call 911</strong> (or your local emergency number) or go to the nearest emergency room if you
          have chest pain, trouble breathing, a limb that is cold, pale, or blue, or pain and swelling that are
          quickly getting worse.
        </p>
        <p>
          For other concerns, <strong>call your surgeon&apos;s or doctor&apos;s office now</strong>. Many have an
          after-hours line. If you can&apos;t reach them, go to urgent care or the ER.
        </p>
      </div>

      {onBack && (
        <div className="mt-6 print:hidden">
          <p className="text-sm text-red-900">
            Checked something by mistake? You can go back and change your answers.
          </p>
          <button type="button" onClick={onBack} className="btn-secondary mt-2">
            Go back and edit my answers
          </button>
        </div>
      )}
    </section>
  );
}
