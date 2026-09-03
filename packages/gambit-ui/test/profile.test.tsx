import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileDetailsCard, ChangePasswordCard, type Profile } from "../src/index";

/**
 * These render the real components against a fake client.
 *
 * The client is the whole seam: if these can be driven with an object the test
 * makes up, so can any app, whatever its HTTP layer or endpoint paths.
 */

const PROFILE: Profile = {
  id: "u1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phoneNumber: "555-0100",
  roles: "Member",
  avatar: null,
};

const makeClient = (over: Partial<Record<string, unknown>> = {}) => ({
  load: vi.fn().mockResolvedValue(PROFILE),
  save: vi.fn().mockImplementation(async (patch) => ({ ...PROFILE, ...patch })),
  uploadAvatar: vi.fn().mockResolvedValue({ base64: "AAAA", mime: "image/png" }),
  removeAvatar: vi.fn().mockResolvedValue(undefined),
  changePassword: vi.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("ProfileDetailsCard", () => {
  it("loads through the injected client and shows what came back", async () => {
    const client = makeClient();
    render(<ProfileDetailsCard client={client} />);

    expect(await screen.findByDisplayValue("Ada Lovelace")).toBeDefined();
    expect(screen.getByDisplayValue("555-0100")).toBeDefined();
    expect(client.load).toHaveBeenCalledOnce();
  });

  it("shows email and role but never lets them be edited", async () => {
    // Changing either is an administrative act. A form that appears to offer it
    // is worse than one that does not.
    const client = makeClient();
    render(<ProfileDetailsCard client={client} />);
    await screen.findByDisplayValue("Ada Lovelace");

    expect(screen.getByDisplayValue("ada@example.com")).toHaveProperty("disabled", true);
    expect(screen.getByDisplayValue("Member")).toHaveProperty("disabled", true);
  });

  it("saves only name and phone — the fields a person may change about themselves", async () => {
    const client = makeClient();
    render(<ProfileDetailsCard client={client} />);
    await screen.findByDisplayValue("Ada Lovelace");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.save).toHaveBeenCalled());
    expect(Object.keys(client.save.mock.calls[0][0]).sort()).toEqual(["name", "phoneNumber"]);
  });

  it("trims before saving, and refuses a name that is effectively blank", async () => {
    const client = makeClient();
    render(<ProfileDetailsCard client={client} />);
    const name = await screen.findByDisplayValue("Ada Lovelace");

    await userEvent.clear(name);
    await userEvent.type(name, "   A   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter your name")).toBeDefined();
    expect(client.save).not.toHaveBeenCalled();
  });

  it("shows the server's message when a save fails", async () => {
    const client = makeClient({ save: vi.fn().mockRejectedValue(new Error("Nothing to update")) });
    render(<ProfileDetailsCard client={client} />);
    await screen.findByDisplayValue("Ada Lovelace");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nothing to update")).toBeDefined();
  });

  it("says so when the profile cannot be loaded at all", async () => {
    const client = makeClient({ load: vi.fn().mockRejectedValue(new Error("boom")) });
    render(<ProfileDetailsCard client={client} />);
    expect(await screen.findByText("Could not load your profile.")).toBeDefined();
  });

  it("offers Remove only when there is a photo to remove", async () => {
    // Two separate renders rather than a rerender: the card loads ONCE by
    // design, so swapping the client on an existing instance would not refetch
    // — which is the behaviour, not a limitation.
    const { unmount } = render(<ProfileDetailsCard client={makeClient()} />);
    await screen.findByDisplayValue("Ada Lovelace");
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    unmount();

    render(
      <ProfileDetailsCard
        client={makeClient({
          load: vi.fn().mockResolvedValue({
            ...PROFILE,
            avatar: { base64: "AAAA", mime: "image/png" },
          }),
        })}
      />,
    );
    expect(await screen.findByRole("button", { name: "Remove" })).toBeDefined();
  });

  it("takes app-supplied labels, so it needs no i18n library", async () => {
    const client = makeClient();
    render(<ProfileDetailsCard client={client} labels={{ details: "Tus datos", save: "Guardar" }} />);
    expect(await screen.findByText("Tus datos")).toBeDefined();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDefined();
  });
});

describe("ChangePasswordCard", () => {
  const fill = async (current: string, next: string, confirm: string) => {
    await userEvent.type(screen.getByLabelText("Current password"), current);
    await userEvent.type(screen.getByLabelText("New password"), next);
    await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
    await userEvent.click(screen.getByRole("button", { name: "Update password" }));
  };

  it("applies the SAME rule the server applies, with the same words", async () => {
    // checkNewPassword comes from gambit-account, which the API also calls.
    // The form cannot disagree with the API about what is acceptable, because
    // there is only one definition.
    const client = makeClient();
    render(<ChangePasswordCard client={client} />);

    await fill("old-password", "short", "short");
    expect(await screen.findByText(/at least 8 characters/i)).toBeDefined();
    expect(client.changePassword).not.toHaveBeenCalled();
  });

  it("refuses a confirmation that does not match", async () => {
    const client = makeClient();
    render(<ChangePasswordCard client={client} />);

    await fill("old-password", "a-long-new-password", "a-different-one");
    expect(await screen.findByText("The passwords don't match.")).toBeDefined();
    expect(client.changePassword).not.toHaveBeenCalled();
  });

  it("refuses a change that is not a change", async () => {
    const client = makeClient();
    render(<ChangePasswordCard client={client} />);

    await fill("the-same-password", "the-same-password", "the-same-password");
    expect(await screen.findByText(/already your current password/i)).toBeDefined();
    expect(client.changePassword).not.toHaveBeenCalled();
  });

  it("submits, confirms, and CLEARS the fields", async () => {
    // Cleared so a shared machine does not keep the values in the form, and so
    // the button cannot be pressed twice by accident.
    const client = makeClient();
    render(<ChangePasswordCard client={client} />);

    await fill("old-password", "a-long-new-password", "a-long-new-password");
    await waitFor(() => expect(client.changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "a-long-new-password",
    }));

    expect(await screen.findByText("Password updated")).toBeDefined();
    expect(screen.getByLabelText("Current password")).toHaveProperty("value", "");
    expect(screen.getByLabelText("New password")).toHaveProperty("value", "");
  });

  it("shows the server's refusal verbatim", async () => {
    // The server is the authority, and it deliberately does not distinguish
    // "wrong password" from "no password set".
    const client = makeClient({
      changePassword: vi.fn().mockRejectedValue(new Error("Your current password is incorrect")),
    });
    render(<ChangePasswordCard client={client} />);

    await fill("wrong", "a-long-new-password", "a-long-new-password");
    expect(await screen.findByText("Your current password is incorrect")).toBeDefined();
  });

  it("notifies the host app after a successful change", async () => {
    const onChanged = vi.fn();
    render(<ChangePasswordCard client={makeClient()} onChanged={onChanged} />);

    await fill("old-password", "a-long-new-password", "a-long-new-password");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
