import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionMatrix } from "../src/roles/PermissionMatrix";
import type { PermissionRecord, RoleDisplayGroup } from "../src/roles/types";

/**
 * Fixture names are invented and generic — "Alpha"/"Bravo"/"Nothing Here" —
 * never either real host app. That is deliberate: this package ships
 * publicly, and naming a consumer here would be the exact design failure
 * `prepublish-check.mjs` refuses to publish.
 */

const PERMISSIONS: PermissionRecord[] = [
  { key: "alpha:add", group: "Alpha", action: "add" },
  { key: "alpha:write", group: "Alpha", action: "write" },
  { key: "alpha:delete", group: "Alpha", action: "delete" },
  { key: "bravo:add", group: "Bravo", action: "add" },
  { key: "bravo:write", group: "Bravo", action: "write" },
];

// SEAM 1's two real shapes, through one component instance in each test:
//  (a) a row that FOLDS two catalog groups (Alpha + Bravo) into one row.
//  (b) a row ("Nothing Here") whose members have NO matching permission at
//      all — the mechanism that lets a host's row list lead its own catalog.
const FOLDED_AND_EMPTY_GROUPS: RoleDisplayGroup[] = [
  { label: "Alpha & Bravo", members: ["Alpha", "Bravo"] },
  { label: "Nothing Here", members: ["Charlie"] },
];

// MUI's Checkbox does not set the native `.indeterminate` DOM property — it
// swaps the icon and marks the input with `data-indeterminate` /
// `aria-checked="mixed"` instead. Assert on that, not the native property.
const isIndeterminate = (cb: HTMLElement) => cb.getAttribute("data-indeterminate") === "true";

describe("PermissionMatrix", () => {
  it("renders a folded row reflecting keys from both members, and skips a row with zero matches", () => {
    render(
      <PermissionMatrix
        permissions={PERMISSIONS}
        groups={FOLDED_AND_EMPTY_GROUPS}
        selected={["alpha:add", "bravo:add"]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Alpha & Bravo")).toBeDefined();
    expect(screen.queryByText("Nothing Here")).toBeNull();

    // The folded row's Add column reflects alpha:add + bravo:add both being
    // selected — fully checked, not indeterminate.
    const addCheckbox = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    expect(addCheckbox.checked).toBe(true);
    expect(isIndeterminate(addCheckbox)).toBe(false);
  });

  it("clicking an indeterminate group column clears the whole group (all-checked -> off; indeterminate -> off; none -> on)", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PermissionMatrix
        permissions={PERMISSIONS}
        groups={FOLDED_AND_EMPTY_GROUPS}
        // Only alpha:add selected out of the Add column's two keys (alpha:add,
        // bravo:add) — indeterminate.
        selected={["alpha:add"]}
        onChange={onChange}
      />,
    );

    const addCheckbox = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    expect(isIndeterminate(addCheckbox)).toBe(true);

    fireEvent.click(addCheckbox);
    // Indeterminate -> off: alpha:add removed, bravo:add never added.
    expect(onChange).toHaveBeenCalledWith([]);

    onChange.mockClear();
    rerender(
      <PermissionMatrix
        permissions={PERMISSIONS}
        groups={FOLDED_AND_EMPTY_GROUPS}
        selected={[]}
        onChange={onChange}
      />,
    );
    const addCheckboxNoneChecked = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    fireEvent.click(addCheckboxNoneChecked);
    // None checked -> on: both add keys in the group get added.
    expect(onChange).toHaveBeenCalledWith(["alpha:add", "bravo:add"]);
  });

  it("readOnly disables every checkbox and ignores clicks", () => {
    const onChange = vi.fn();
    render(
      <PermissionMatrix
        permissions={PERMISSIONS}
        groups={FOLDED_AND_EMPTY_GROUPS}
        selected={[]}
        onChange={onChange}
        readOnly
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    checkboxes.forEach((cb) => expect(cb.disabled).toBe(true));

    fireEvent.click(checkboxes[0]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
