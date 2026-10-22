"use client";

import dynamic from "next/dynamic";

// The whole game runs in the browser (canvas + live state), so skip server rendering.
const App = dynamic(() => import("../components/App"), { ssr: false });

export default function Page() {
  return <App />;
}
