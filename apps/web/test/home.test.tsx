import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ptBR from "@medagenda/shared/i18n/pt-BR.json";
import HomePage from "../app/page";
import { apiBaseUrl } from "../lib/config";

describe("home page", () => {
  it("renders the app name, tagline and an API health link", () => {
    const html = renderToStaticMarkup(createElement(HomePage));
    expect(html).toContain(ptBR.common.appName);
    expect(html).toContain(ptBR.common.tagline);
    expect(html).toContain(`href="${apiBaseUrl}/health"`);
  });
});
