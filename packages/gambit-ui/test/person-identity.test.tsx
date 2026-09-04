import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createPersonIdentitySchema } from "../src/personIdentity";
import { PersonIdentityFields } from "../src/PersonIdentityFields";

describe("createPersonIdentitySchema", () => {
  it("defaults: rejects a name shorter than 2 chars, accepts exactly 2", () => {
    const schema = createPersonIdentitySchema();
    const short = schema.safeParse({ firstName: "B", lastName: "Ok", email: "a@b.com" });
    expect(short.success).toBe(false);

    const twoChar = schema.safeParse({ firstName: "Bo", lastName: "Li", email: "a@b.com" });
    expect(twoChar.success).toBe(true);
  });

  it("defaults: rejects an email that fails isPlausibleEmail", () => {
    const schema = createPersonIdentitySchema();
    const result = schema.safeParse({ firstName: "Bo", lastName: "Li", email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("defaults: phoneNumber is optional and unconstrained", () => {
    const schema = createPersonIdentitySchema();
    const noPhone = schema.safeParse({ firstName: "Bo", lastName: "Li", email: "a@b.com" });
    expect(noPhone.success).toBe(true);

    const anyPhone = schema.safeParse({ firstName: "Bo", lastName: "Li", email: "a@b.com", phoneNumber: "x" });
    expect(anyPhone.success).toBe(true);
  });

  it("requirePhone + phoneMinLength: rejects missing, rejects too short, accepts exact length", () => {
    const schema = createPersonIdentitySchema({ requirePhone: true, phoneMinLength: 10 });

    expect(schema.safeParse({ firstName: "Bo", lastName: "Li", email: "a@b.com" }).success).toBe(false);
    expect(
      schema.safeParse({ firstName: "Bo", lastName: "Li", email: "a@b.com", phoneNumber: "123456789" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ firstName: "Bo", lastName: "Li", email: "a@b.com", phoneNumber: "1234567890" }).success,
    ).toBe(true);
  });

  it("nameMinLength: a configurable floor, not hardcoded", () => {
    const schema = createPersonIdentitySchema({ nameMinLength: 3 });
    expect(schema.safeParse({ firstName: "Bo", lastName: "Lee", email: "a@b.com" }).success).toBe(false);
    expect(schema.safeParse({ firstName: "Bob", lastName: "Lee", email: "a@b.com" }).success).toBe(true);
  });
});

describe("PersonIdentityFields", () => {
  const values = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" };

  it("renders 3 controlled inputs — first, last, email — and NOT a phone field", () => {
    render(<PersonIdentityFields values={values} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Ada")).toBeDefined();
    expect(screen.getByDisplayValue("Lovelace")).toBeDefined();
    expect(screen.getByDisplayValue("ada@example.com")).toBeDefined();
    expect(screen.queryByLabelText(/phone/i)).toBeNull();
  });

  it("calls onChange(field, value) per keystroke on the right field", () => {
    const onChange = vi.fn();
    render(<PersonIdentityFields values={values} onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue("Ada"), { target: { value: "Adaa" } });
    expect(onChange).toHaveBeenCalledWith("firstName", "Adaa");

    fireEvent.change(screen.getByDisplayValue("Lovelace"), { target: { value: "Lovelaced" } });
    expect(onChange).toHaveBeenCalledWith("lastName", "Lovelaced");

    fireEvent.change(screen.getByDisplayValue("ada@example.com"), { target: { value: "new@example.com" } });
    expect(onChange).toHaveBeenCalledWith("email", "new@example.com");
  });

  it("shows errors.email text when supplied", () => {
    render(<PersonIdentityFields values={values} onChange={vi.fn()} errors={{ email: "Bad email" }} />);
    expect(screen.getByText("Bad email")).toBeDefined();
  });

  it("renders the email field disabled with emailDisabledHint text when emailDisabled is true", () => {
    render(
      <PersonIdentityFields
        values={values}
        onChange={vi.fn()}
        emailDisabled
        emailDisabledHint="Email can't be changed"
      />,
    );
    const emailInput = screen.getByDisplayValue("ada@example.com") as HTMLInputElement;
    expect(emailInput.disabled).toBe(true);
    expect(screen.getByText("Email can't be changed")).toBeDefined();
  });
});
