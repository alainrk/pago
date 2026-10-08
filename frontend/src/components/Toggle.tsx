import styles from "./Toggle.module.css";

interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

// Toggle is an on/off switch with its label on the left. It is a native
// checkbox with role="switch", so keyboard and screen readers work as usual.
export function Toggle({ id, label, checked, disabled, onChange }: ToggleProps) {
  return (
    <label className={[styles.toggle, disabled ? styles.disabled : ""].filter(Boolean).join(" ")} htmlFor={id}>
      <span className={styles.label}>{label}</span>
      <input id={id} type="checkbox" role="switch" className={styles.input} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.track} aria-hidden>
        <span className={styles.thumb} />
      </span>
    </label>
  );
}
