import { RouterProvider } from "react-router";
import { router } from "./routes";
import { seedInitialData } from "./components/initial-data";
import { installErrorHandlers } from "./components/error-logger";

// Initialise app-level side effects exactly once (module scope).
// ── v4 hard-reset: restructured to force full proxy recompile ──
const _boot = (() => {
  seedInitialData();
  installErrorHandlers();
  return true;
})();

export default function App() {
  return <RouterProvider router={router} />;
}
