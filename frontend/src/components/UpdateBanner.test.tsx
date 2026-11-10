import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { UpdateBannerView } from "./UpdateBanner";

describe("UpdateBannerView", () => {
  it("offers a refresh", () => {
    const html = renderToString(<UpdateBannerView onRefresh={() => {}} />);
    expect(html).toContain("A new version of Pago is ready.");
    expect(html).toContain("Refresh");
  });
});
