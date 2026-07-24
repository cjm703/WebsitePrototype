import { createContext, useContext } from "react";

export type InterfaceSession = {
  playerId: string;
  isDM: boolean;
};

const InterfaceSessionContext = createContext<InterfaceSession | null>(null);

export const InterfaceSessionProvider = InterfaceSessionContext.Provider;

export function useInterfaceSession() {
  const session = useContext(InterfaceSessionContext);
  if (!session) {
    throw new Error("Interface session is not available");
  }
  return session;
}
