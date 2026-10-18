import { describe, expect, it } from "vitest";
import { SEED_CATEGORIES, SEED_MEASUREMENTS } from "../db/seed/catalog";
import {
  definitionSchema,
  diffDefinitions,
  measurementRefErrors,
  type CategoryDefinitionInput,
} from "./categoryDefinition";

const library = SEED_MEASUREMENTS.map((m) => ({ key: m.key, isActive: true }));

function issues(def: unknown): string[] {
  const r = definitionSchema.safeParse(def);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

const num = (key: string, extra: Record<string, unknown> = {}) => ({ kind: "number", key, label: key, min: 0, max: 10, step: 1, ...extra });

describe("definitionSchema (meta-schema)", () => {
  it("accepts every seed category and fills in defaults", () => {
    for (const c of SEED_CATEGORIES) {
      const parsed = definitionSchema.parse(c.definition);
      expect(measurementRefErrors(parsed, library), c.key).toEqual([]);
    }
    const parsed = definitionSchema.parse({ sections: [{ fields: [{ kind: "text", key: "shade", label: "Shade" }] }] });
    expect(parsed.sections[0]).toEqual({ title: "", fields: [{ kind: "text", key: "shade", label: "Shade", maxLength: 200, required: false }] });
  });

  it("accepts the example from the brief", () => {
    const def: CategoryDefinitionInput = {
      sections: [
        {
          title: "Your measurements",
          fields: [
            { kind: "measurement", measurementKey: "chest_cm", required: true },
            { kind: "number", key: "cyl_left", label: "CYL (left)", min: -10, max: 10, step: 0.25 },
            { kind: "number", key: "axis_left", label: "Axis (left)", min: 0, max: 180, step: 1, requiredIf: { field: "cyl_left", op: "neq", value: 0 } },
            { kind: "select", key: "size_system", label: "Size system", options: ["UK", "US", "EU", "CN"], required: true },
            { kind: "text", key: "shade", label: "Shade / colour", maxLength: 80 },
            { kind: "textarea", key: "notes", label: "Anything else", maxLength: 500 },
            { kind: "boolean", key: "has_box", label: "Keep the original box?" },
            { kind: "multiselect", key: "extras", label: "Extras", options: ["Gift wrap", "Receipt"] },
          ],
        },
      ],
    };
    expect(issues(def)).toEqual([]);
  });

  it("rejects bad, reserved and duplicate keys", () => {
    expect(issues({ sections: [{ fields: [num("Chest")] }] }).join()).toMatch(/lowercase/);
    expect(issues({ sections: [{ fields: [num("variant_text")] }] }).join()).toMatch(/reserved/);
    expect(issues({ sections: [{ fields: [num("a")] }, { fields: [num("a")] }] }).join()).toMatch(/used twice/);
    // A measurement's key is its measurement key, so it clashes with a field of the same name.
    expect(
      issues({ sections: [{ fields: [{ kind: "measurement", measurementKey: "chest_cm" }, num("chest_cm")] }] }).join(),
    ).toMatch(/used twice/);
  });

  it("refuses free-form patterns and unknown properties (no regex, no code)", () => {
    expect(issues({ sections: [{ fields: [{ kind: "text", key: "a", label: "A", pattern: "^(a+)+$" }] }] }).length).toBeGreaterThan(0);
    expect(issues({ sections: [{ fields: [{ kind: "script", key: "a", label: "A" }] }] }).length).toBeGreaterThan(0);
    expect(issues({ sections: [], onSubmit: "fetch('x')" }).length).toBeGreaterThan(0);
  });

  it("checks number bounds", () => {
    expect(issues({ sections: [{ fields: [num("a", { min: 5, max: 5 })] }] }).join()).toMatch(/Min must be below max/);
    expect(issues({ sections: [{ fields: [num("a", { step: 0 })] }] }).join()).toMatch(/Step must be above 0/);
    expect(issues({ sections: [{ fields: [num("a", { max: 1e9, step: 0.001 })] }] }).join()).toMatch(/Step is too small/);
  });

  it("only lets conditions look at earlier fields, with sensible operators", () => {
    const later = { sections: [{ fields: [num("b", { showIf: { field: "a", op: "eq", value: 1 } }), num("a")] }] };
    expect(issues(later).join()).toMatch(/above this one/);
    const self = { sections: [{ fields: [num("a", { showIf: { field: "a", op: "eq", value: 1 } })] }] };
    expect(issues(self).join()).toMatch(/above this one/);
    const gtText = {
      sections: [{ fields: [{ kind: "text", key: "t", label: "T" }, num("n", { requiredIf: { field: "t", op: "gt", value: 1 } })] }],
    };
    expect(issues(gtText).join()).toMatch(/only work on number fields/);
    const badOption = {
      sections: [
        { fields: [{ kind: "select", key: "s", label: "S", options: ["A", "B"] }, num("n", { showIf: { field: "s", op: "eq", value: "C" } })] },
      ],
    };
    expect(issues(badOption).join()).toMatch(/isn't an option/);
    expect(issues({ sections: [{ fields: [num("a"), num("b", { showIf: { field: "a", op: "in", value: 1 } })] }] }).join()).toMatch(/takes a list/);
    expect(issues({ sections: [{ fields: [num("a"), num("b", { required: true, requiredIf: { field: "a", op: "gt", value: 1 } })] }] }).join()).toMatch(
      /not both/,
    );
  });

  it("checks mustExceed points at an earlier number field", () => {
    expect(issues({ sections: [{ fields: [num("a"), num("b", { mustExceed: "a" })] }] })).toEqual([]);
    expect(issues({ sections: [{ fields: [num("b", { mustExceed: "a" }), num("a")] }] }).join()).toMatch(/number field above/);
  });

  it("caps the size of a definition", () => {
    const sixtyOne = Array.from({ length: 61 }, (_, i) => num(`f${i}`));
    const sections = [0, 1].map((s) => ({ fields: sixtyOne.slice(s * 31, s * 31 + 31) }));
    expect(issues({ sections }).join()).toMatch(/At most 60 fields/);
  });

  it("reports unknown and switched-off measurements", () => {
    const def = definitionSchema.parse({ sections: [{ fields: [{ kind: "measurement", measurementKey: "chest_cm" }, { kind: "measurement", measurementKey: "wingspan_cm" }] }] });
    expect(measurementRefErrors(def, library)).toEqual(["Unknown measurement “wingspan_cm”"]);
    expect(measurementRefErrors(def, [{ key: "chest_cm", isActive: false }, { key: "wingspan_cm", isActive: true }])).toEqual([
      "Measurement “chest_cm” is switched off",
    ]);
  });
});

describe("diffDefinitions", () => {
  it("lists fields added, removed and changed", () => {
    const before = definitionSchema.parse({ sections: [{ fields: [num("a"), num("b")] }] });
    const after = definitionSchema.parse({ sections: [{ fields: [num("a", { max: 20 }), num("c")] }], option: { label: "Colour", required: true } });
    expect(diffDefinitions(before, after)).toEqual({
      added: ["c"],
      removed: ["b"],
      changed: [{ key: "a", what: ["max"] }],
      optionChanged: true,
    });
    expect(diffDefinitions(null, after).added).toEqual(["a", "c"]);
  });
});

describe("keyKindConflicts", () => {
  it("lets keys be dropped but not come back as a different kind", async () => {
    const { keyKindConflicts } = await import("./categoryDefinition");
    const v1 = definitionSchema.parse({ sections: [{ fields: [num("size")] }] });
    const v2 = definitionSchema.parse({ sections: [{ fields: [] }] });
    const v3 = definitionSchema.parse({ sections: [{ fields: [{ kind: "text", key: "size", label: "Size" }] }] });
    expect(keyKindConflicts([v1], v2)).toEqual([]);
    expect(keyKindConflicts([v1, v2], v3)).toEqual(["“size” was a number field before; use a new key for a text field"]);
  });
});
