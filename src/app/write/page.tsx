import { Suspense } from "react";
import { Editor } from "./editor";

export const dynamic = "force-dynamic";

export default function WritePage() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}
