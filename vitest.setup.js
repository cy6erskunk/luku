import { vi } from "vitest";

let counter = 0;

vi.mock("@stylexjs/stylex", () => ({
  default: {
    create: (styles) => styles,
    props: (...args) => {
      const result = {};
      for (const arg of args) {
        if (arg && typeof arg === "object") {
          Object.assign(result, { style: { ...result.style, ...arg } });
        }
      }
      return result;
    },
    keyframes: () => `keyframes-${++counter}`,
  },
  create: (styles) => styles,
  props: (...args) => {
    const result = {};
    for (const arg of args) {
      if (arg && typeof arg === "object") {
        Object.assign(result, { style: { ...result.style, ...arg } });
      }
    }
    return result;
  },
  keyframes: () => `keyframes-${++counter}`,
}));
