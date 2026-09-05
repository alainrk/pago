import { Card } from "./Card";

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: "income" | "brand" | "plain" }) {
  const color = tone === "income" ? "var(--income)" : tone === "brand" ? "var(--brand-dark)" : "var(--text)";
  return (
    <Card padding="20px 24px" paddingMobile="16px" gap="6px" gapMobile="4px">
      <div className="stat-label">{label}</div>
      <div className="mono stat-value" style={{ fontWeight: 600, color }}>
        {value}
      </div>
    </Card>
  );
}
