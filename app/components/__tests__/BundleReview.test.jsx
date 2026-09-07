// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import BundleReview from "../BundleReview.jsx";

afterEach(cleanup);

describe("BundleReview", () => {
  it("renders nothing when no bundle has any words", () => {
    const { container } = render(
      <BundleReview bundles={[{ id: 1, name: "Kotimaa", wordCount: 0, dueCount: 0 }]} onStartBundleReview={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("names each bundle and how many of its cards are due", () => {
    render(
      <BundleReview
        bundles={[{ id: 1, name: "Kotimaa", wordCount: 9, dueCount: 3 }]}
        onStartBundleReview={vi.fn()}
      />
    );
    expect(screen.getByText("Kotimaa")).toBeTruthy();
    expect(screen.getByText("3 due")).toBeTruthy();
  });

  it("offers the bundle's size when nothing in it is due", () => {
    render(
      <BundleReview
        bundles={[{ id: 1, name: "Kotimaa", wordCount: 1, dueCount: 0 }]}
        onStartBundleReview={vi.fn()}
      />
    );
    expect(screen.getByText("1 word")).toBeTruthy();
  });

  it("skips the bundles with nothing in them", () => {
    render(
      <BundleReview
        bundles={[
          { id: 1, name: "Kotimaa", wordCount: 4, dueCount: 0 },
          { id: 2, name: "Tyhjä", wordCount: 0, dueCount: 0 },
        ]}
        onStartBundleReview={vi.fn()}
      />
    );
    expect(screen.getByText("Kotimaa")).toBeTruthy();
    expect(screen.queryByText("Tyhjä")).toBeNull();
  });

  it("starts a review of the bundle that was picked", () => {
    const onStart = vi.fn();
    render(
      <BundleReview
        bundles={[
          { id: 1, name: "Kotimaa", wordCount: 4, dueCount: 1 },
          { id: 2, name: "Luku 3", wordCount: 2, dueCount: 0 },
        ]}
        onStartBundleReview={onStart}
      />
    );
    fireEvent.click(screen.getByText("Luku 3"));
    expect(onStart).toHaveBeenCalledWith(2);
  });
});
