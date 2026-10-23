import { describe, expect, it } from "vitest";
import { classifySource, domainOf, isSameDomain } from "../src/engine/classify-source";

describe("domainOf", () => {
  it("strips www and protocol", () => {
    expect(domainOf("https://www.g2.com/products/x")).toBe("g2.com");
    expect(domainOf("http://practo.com/doctor")).toBe("practo.com");
  });

  it("falls back to the raw string for invalid URLs", () => {
    expect(domainOf("not-a-url")).toBe("not-a-url");
  });
});

describe("isSameDomain", () => {
  it("matches exact and subdomain variants", () => {
    expect(isSameDomain("velectico.com", "velectico.com")).toBe(true);
    expect(isSameDomain("blog.velectico.com", "velectico.com")).toBe(true);
    expect(isSameDomain("other.com", "velectico.com")).toBe(false);
  });
});

describe("classifySource", () => {
  it("classifies known review sites", () => {
    expect(classifySource("https://www.practo.com/doctor/x")).toBe("review_site");
    expect(classifySource("https://g2.com/products/x")).toBe("review_site");
  });

  it("classifies directories", () => {
    expect(classifySource("https://clutch.co/profile/x")).toBe("directory");
  });

  it("classifies reddit, youtube, wiki, social", () => {
    expect(classifySource("https://www.reddit.com/r/x")).toBe("reddit");
    expect(classifySource("https://youtube.com/watch?v=x")).toBe("youtube");
    expect(classifySource("https://en.wikipedia.org/wiki/x")).toBe("wiki");
    expect(classifySource("https://www.linkedin.com/company/x")).toBe("social");
  });

  it("classifies the brand's own site before any other rule", () => {
    expect(
      classifySource("https://velectico.com/about", { brandDomain: "velectico.com" }),
    ).toBe("own_site");
  });

  it("classifies a tracked competitor site", () => {
    expect(
      classifySource("https://tcs.com/services", {
        competitorDomains: ["tcs.com"],
      }),
    ).toBe("competitor_site");
  });

  it("falls back to other for unrecognized domains", () => {
    expect(classifySource("https://some-random-blog.io/post")).toBe("other");
  });
});
