import { Suspense } from "react";
import NcaaHoopsSubmitClient from "./NcaaHoopsSubmitClient";

export default function NcaaHoopsSubmitPage() {
  return (
    <Suspense fallback={<div className="p-6" style={{ color: "var(--text-0)" }}>Loading…</div>}>
      <NcaaHoopsSubmitClient />
    </Suspense>
  );
}
