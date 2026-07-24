import { Navigate, Outlet } from "react-router";
import { useInterfaceSession } from "./session-context";

export function RequireDMRoute() {
  const session = useInterfaceSession();
  return session.isDM ? <Outlet /> : <Navigate to="/interface" replace />;
}
