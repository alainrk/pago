import { Button } from "./Button";
import { usePrivacy } from "../lib/privacy";

// PrivacyToggle is the eye button that hides or shows amounts. It lives in
// the header of the Activity and Reports pages.
export function PrivacyToggle({ size = 32, iconSize = 15 }: { size?: number; iconSize?: number }) {
  const { hidden, toggle } = usePrivacy();
  const label = hidden ? "Show amounts" : "Hide amounts";
  return (
    <Button
      variant="icon"
      icon={hidden ? "eye-off" : "eye"}
      iconSize={iconSize}
      style={{ "--h": `${size}px` } as never}
      onClick={toggle}
      aria-label={label}
      aria-pressed={hidden}
      title={label}
    />
  );
}
