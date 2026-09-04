import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RoleFormDialog } from "../src/roles/RoleFormDialog";
import { RolesPanel } from "../src/roles/RolesPanel";
import type { PermissionRecord, RoleDisplayGroup, RoleRecord } from "../src/roles/types";

const PERMISSIONS: PermissionRecord[] = [
  { key: "alpha:add", group: "Alpha", action: "add", label: "Alpha Add" },
  { key: "alpha:write", group: "Alpha", action: "write", label: "Alpha Edit" },
  { key: "alpha:delete", group: "Alpha", action: "delete", label: "Alpha Delete" },
  { key: "alpha:read", group: "Alpha", action: "read", label: "Alpha Read" },
];

const GROUPS: RoleDisplayGroup[] = [{ label: "Alpha", members: ["Alpha"] }];

// Host B's catalog-leading, zero-match row (SEAM 1's Kimorah-shaped case).
const GROUPS_WITH_EMPTY_ROW: RoleDisplayGroup[] = [
  ...GROUPS,
  { label: "Nothing Here", members: ["Charlie"] },
];

// MUI's Switch renders role="switch", not "checkbox" — the matrix's plain
// Checkboxes are the only role="checkbox" elements in this dialog. The
// Tooltip wrapping each switch overrides its accessible NAME with the
// tooltip text (not the visible "Global role" label), so these are found by
// DOM order instead: Global always renders first, Default (when present)
// always second.
const getGlobalSwitch = () => screen.getAllByRole("switch")[0];
const getDefaultSwitch = () => screen.getAllByRole("switch")[1];
const getRoleNameInput = (scope: { getByLabelText: typeof screen.getByLabelText } = screen) =>
  scope.getByLabelText(/Role Name/i);

describe("RoleFormDialog", () => {
  it("create mode: toggling isGlobal on selects every key; off clears the selection", () => {
    render(
      <RoleFormDialog
        open
        mode="create"
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const globalSwitch = getGlobalSwitch();
    fireEvent.click(globalSwitch); // on
    let checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect((cb as HTMLInputElement).checked).toBe(true));

    fireEvent.click(globalSwitch); // off
    checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect((cb as HTMLInputElement).checked).toBe(false));
  });

  it("edit mode: toggling isGlobal on selects every key; off leaves the current selection untouched", () => {
    render(
      <RoleFormDialog
        open
        mode="edit"
        initialValues={{ name: "Existing", permissions: ["alpha:add"], isGlobal: false }}
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const globalSwitch = getGlobalSwitch();
    fireEvent.click(globalSwitch); // on -> selects everything
    let checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect((cb as HTMLInputElement).checked).toBe(true));

    fireEvent.click(globalSwitch); // off -> LEAVES the current (all-selected) selection untouched
    checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect((cb as HTMLInputElement).checked).toBe(true));
  });

  it("calls reconcilePermissions on the selected keys immediately before onSubmit, when supplied", () => {
    const onSubmit = vi.fn();
    const reconcile = vi.fn((keys: string[]) => [...keys, "alpha:sentinel"]);
    render(
      <RoleFormDialog
        open
        mode="create"
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={onSubmit}
        onClose={vi.fn()}
        reconcilePermissions={reconcile}
      />,
    );

    fireEvent.change(getRoleNameInput(), { target: { value: "Test Role" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(reconcile).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: expect.arrayContaining(["alpha:sentinel"]) }),
    );
  });

  it("omits reconcilePermissions -> onSubmit receives the raw selection unchanged", () => {
    const onSubmit = vi.fn();
    render(
      <RoleFormDialog
        open
        mode="create"
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(getRoleNameInput(), { target: { value: "Test Role" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ permissions: [] }));
  });

  it("supportsDefaultRole=false renders no default-role switch and no isDefault key; true renders it and threads the value through", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <RoleFormDialog
        open
        mode="create"
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={onSubmit}
        onClose={vi.fn()}
        supportsDefaultRole={false}
      />,
    );
    expect(screen.queryByText(/Default role for new signups/i)).toBeNull();
    fireEvent.change(getRoleNameInput(), { target: { value: "R1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("isDefault");

    onSubmit.mockClear();
    rerender(
      <RoleFormDialog
        open
        mode="create"
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={onSubmit}
        onClose={vi.fn()}
        supportsDefaultRole
      />,
    );
    expect(screen.getByText(/Default role for new signups/i)).toBeDefined();
    fireEvent.click(getDefaultSwitch());
    fireEvent.change(getRoleNameInput(), { target: { value: "R2" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ isDefault: true });
  });

  it("isGlobalActiveNote renders only when supplied AND isGlobal is true", () => {
    render(
      <RoleFormDialog
        open
        mode="create"
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        labels={{ isGlobalActiveNote: "Global note text" }}
      />,
    );
    expect(screen.queryByText("Global note text")).toBeNull(); // isGlobal still false

    fireEvent.click(getGlobalSwitch());
    expect(screen.getByText("Global note text")).toBeDefined();
  });

  it("isGlobalActiveNote never renders when the label is omitted, regardless of isGlobal", () => {
    render(
      <RoleFormDialog
        open
        mode="create"
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(getGlobalSwitch());
    expect(screen.queryByText(/Global is on/i)).toBeNull();
  });

  it("processing -> false with no error closes; the same transition WITH error does not close and (edit mode) renders it inline", () => {
    const onClose = vi.fn();
    const initial = { name: "R", permissions: [], isGlobal: false };
    const { rerender } = render(
      <RoleFormDialog
        open
        mode="edit"
        initialValues={initial}
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={vi.fn()}
        onClose={onClose}
        processing
      />,
    );
    rerender(
      <RoleFormDialog
        open
        mode="edit"
        initialValues={initial}
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={vi.fn()}
        onClose={onClose}
        processing={false}
      />,
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    const initial2 = { name: "R2", permissions: [], isGlobal: false };
    const { rerender: rerender2 } = render(
      <RoleFormDialog
        open
        mode="edit"
        initialValues={initial2}
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={vi.fn()}
        onClose={onClose}
        processing
      />,
    );
    rerender2(
      <RoleFormDialog
        open
        mode="edit"
        initialValues={initial2}
        permissions={PERMISSIONS}
        groups={GROUPS}
        onSubmit={vi.fn()}
        onClose={onClose}
        processing={false}
        error="It broke"
      />,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("It broke")).toBeDefined();
  });
});

describe("RolesPanel", () => {
  const ROLE: RoleRecord = { _id: "r1", name: "Alpha Role", permissions: ["alpha:add"], isGlobal: false };

  it("canCreate=false hides the new-role trigger entirely", () => {
    render(
      <RolesPanel
        roles={[ROLE]}
        permissions={PERMISSIONS}
        groups={GROUPS}
        onCreateRole={vi.fn()}
        onUpdateRole={vi.fn()}
        onDeleteRole={vi.fn()}
        canCreate={false}
        canEdit
        canDelete
      />,
    );
    expect(screen.queryByRole("button", { name: /New Role/i })).toBeNull();
  });

  it("viewOnly=true renders the read-only banner from labels.readOnlyMessage", () => {
    render(
      <RolesPanel
        roles={[ROLE]}
        permissions={PERMISSIONS}
        groups={GROUPS}
        onCreateRole={vi.fn()}
        onUpdateRole={vi.fn()}
        onDeleteRole={vi.fn()}
        canCreate
        canEdit
        canDelete
        viewOnly
        labels={{ readOnlyMessage: "You can look but not touch." }}
      />,
    );
    expect(screen.getByText("You can look but not touch.")).toBeDefined();
  });

  // Required by the verification baseline: drives RolesPanel end-to-end twice
  // in the same file, with two distinct fixture "hosts" — never naming either
  // real app — proving both read-key strategies and both GROUP_ROWS shapes
  // work through the one component.
  it("Host A (no reconcile, folding groups) never synthesizes a :read key; Host B (reconcile spy, catalog-leading empty row) has its reconciler called before onCreateRole", () => {
    // Host A
    const onCreateRoleA = vi.fn();
    const { unmount } = render(
      <RolesPanel
        roles={[]}
        permissions={PERMISSIONS}
        groups={GROUPS}
        onCreateRole={onCreateRoleA}
        onUpdateRole={vi.fn()}
        onDeleteRole={vi.fn()}
        canCreate
        canEdit
        canDelete
        supportsDefaultRole={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /New Role/i }));
    const dialogA = screen.getByRole("dialog");
    fireEvent.change(getRoleNameInput(within(dialogA)), { target: { value: "Host A Role" } });
    fireEvent.click(within(dialogA).getAllByRole("checkbox")[0]); // Alpha's Add column
    fireEvent.click(within(dialogA).getByRole("button", { name: "Create" }));

    expect(onCreateRoleA).toHaveBeenCalled();
    const payloadA = onCreateRoleA.mock.calls[0][0];
    expect(payloadA.permissions.some((k: string) => k.endsWith(":read"))).toBe(false);
    unmount();

    // Host B
    const reconcileSpy = vi.fn((keys: string[]) => [...keys, "alpha:read"]);
    const onCreateRoleB = vi.fn();
    render(
      <RolesPanel
        roles={[]}
        permissions={PERMISSIONS}
        groups={GROUPS_WITH_EMPTY_ROW}
        onCreateRole={onCreateRoleB}
        onUpdateRole={vi.fn()}
        onDeleteRole={vi.fn()}
        canCreate
        canEdit
        canDelete
        reconcilePermissions={reconcileSpy}
        supportsDefaultRole
      />,
    );
    // The catalog-leading empty row never renders.
    expect(screen.queryByText("Nothing Here")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /New Role/i }));
    const dialogB = screen.getByRole("dialog");
    fireEvent.change(getRoleNameInput(within(dialogB)), { target: { value: "Host B Role" } });
    fireEvent.click(within(dialogB).getByRole("button", { name: "Create" }));

    expect(reconcileSpy).toHaveBeenCalled();
    expect(onCreateRoleB).toHaveBeenCalled();
    const payloadB = onCreateRoleB.mock.calls[0][0];
    expect(payloadB.permissions).toContain("alpha:read");
    expect(payloadB).toHaveProperty("isDefault");
  });
});
