import Link from "next/link";
import { FeedbackForm } from "@/components/FeedbackForm";

export const metadata = { title: "Send feedback · Poracode" };
export default function FeedbackPage() {
  return (
    <main className="min-h-screen bg-[#24242b] p-5 text-white">
      <nav className="mx-auto mb-12 flex max-w-4xl justify-between">
        <Link href="/">Pora.code</Link>
        <a href="https://github.com/Porabuild/Poracode/issues">Browse public issues</a>
      </nav>
      <div className="mx-auto grid max-w-4xl gap-10 md:grid-cols-[1fr_500px]">
        <header>
          <h1 className="text-3xl font-semibold">Send feedback</h1>
          <p className="mt-3 text-gray-400">
            Found a bug? Have an idea?
            <br />
            Help us improve Poracode.
          </p>
        </header>
        <FeedbackForm />
      </div>
    </main>
  );
}
