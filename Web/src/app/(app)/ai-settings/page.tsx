import { Suspense } from "react";
import { AiSettings } from "@/components/AiSettings";

export const metadata = { title: "AI settings · BookPal" };

export default function AiSettingsPage() {
  return (
    <main className="narrow wide">
      <div className="page-head">
        <h1>AI settings</h1>
        <div className="voice">Use your ChatGPT plan while you read.</div>
      </div>
      <Suspense fallback={<p className="voice">Loading…</p>}>
        <AiSettings />
      </Suspense>
    </main>
  );
}
