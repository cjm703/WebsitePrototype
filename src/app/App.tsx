import { RouterProvider } from "react-router";
import { router } from "./routes";
import { installErrorHandlers } from "./components/error-logger";

const _boot = (() => {
  installErrorHandlers();
  return true;
})();

export default function App() {
  return <RouterProvider router={router} />;
}