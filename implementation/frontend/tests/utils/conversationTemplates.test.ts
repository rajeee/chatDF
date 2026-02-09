import { describe, it, expect } from "vitest";
import {
  getConversationTemplates,
  type ConversationTemplate,
} from "@/utils/conversationTemplates";

describe("getConversationTemplates", () => {
  it("returns all 5 templates", () => {
    const templates = getConversationTemplates();
    expect(templates).toHaveLength(5);
  });

  it("returns templates with the expected IDs", () => {
    const templates = getConversationTemplates();
    const ids = templates.map((t) => t.id);
    expect(ids).toEqual([
      "quick-explore",
      "compare-datasets",
      "time-series",
      "data-quality",
      "distribution",
    ]);
  });

  it("each template has all required fields", () => {
    const templates = getConversationTemplates();
    for (const template of templates) {
      expect(template).toHaveProperty("id");
      expect(template).toHaveProperty("name");
      expect(template).toHaveProperty("description");
      expect(template).toHaveProperty("icon");
      expect(template).toHaveProperty("suggestedPrompts");
      expect(template).toHaveProperty("requiredDatasets");

      expect(typeof template.id).toBe("string");
      expect(typeof template.name).toBe("string");
      expect(typeof template.description).toBe("string");
      expect(typeof template.icon).toBe("string");
      expect(Array.isArray(template.suggestedPrompts)).toBe(true);
      expect(typeof template.requiredDatasets).toBe("number");
    }
  });

  it("each template has non-empty id, name, and description", () => {
    const templates = getConversationTemplates();
    for (const template of templates) {
      expect(template.id.length).toBeGreaterThan(0);
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
    }
  });

  it("each template has at least one suggested prompt", () => {
    const templates = getConversationTemplates();
    for (const template of templates) {
      expect(template.suggestedPrompts.length).toBeGreaterThan(0);
      for (const prompt of template.suggestedPrompts) {
        expect(typeof prompt).toBe("string");
        expect(prompt.length).toBeGreaterThan(0);
      }
    }
  });

  it("requiredDatasets values are valid non-negative integers", () => {
    const templates = getConversationTemplates();
    for (const template of templates) {
      expect(template.requiredDatasets).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(template.requiredDatasets)).toBe(true);
    }
  });

  it("compare-datasets requires 2 datasets", () => {
    const templates = getConversationTemplates();
    const compare = templates.find((t) => t.id === "compare-datasets");
    expect(compare).toBeDefined();
    expect(compare!.requiredDatasets).toBe(2);
  });

  it("single-dataset templates require exactly 1 dataset", () => {
    const templates = getConversationTemplates();
    const singleDatasetIds = ["quick-explore", "time-series", "data-quality", "distribution"];
    for (const id of singleDatasetIds) {
      const template = templates.find((t) => t.id === id);
      expect(template).toBeDefined();
      expect(template!.requiredDatasets).toBe(1);
    }
  });

  it("each template has unique id", () => {
    const templates = getConversationTemplates();
    const ids = templates.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("returns a new array on each call (not a reference)", () => {
    const a = getConversationTemplates();
    const b = getConversationTemplates();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
