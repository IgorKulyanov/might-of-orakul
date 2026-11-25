import { useEffect, useState } from "react";
import { AdminPanel } from "./AdminPanel";

/**
 * Админка по секретному hash #ora-admin — на любом экране
 * (меню, тропы искателя, бой…), не только на SplashMenu.
 */
export function AdminHashGate() {
  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" && window.location.hash === "#ora-admin",
  );

  useEffect(() => {
    const sync = () => setOpen(window.location.hash === "#ora-admin");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <AdminPanel
      open={open}
      onClose={() => {
        setOpen(false);
        if (window.location.hash === "#ora-admin") {
          history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
        }
      }}
    />
  );
}
