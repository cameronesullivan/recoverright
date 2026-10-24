import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <Logo />
          <span className="text-lg">RecoverRight</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-3">
          <Link href="/plans" className="rounded-full px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            My plans
          </Link>
          <Link
            href="/intake"
            className="rounded-full bg-teal-700 px-4 py-2 text-white hover:bg-teal-800"
          >
            <span className="sm:hidden">New plan</span>
            <span className="hidden sm:inline">Build my plan</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
