import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";

/**
 * First name, last name, email — the three fields every enrollment/invite
 * form collects, styled and laid out identically to how both real hosts this
 * was extracted from already had them (a `Grid` row for first/last, a full
 * width field below for email), so adopting this changes no visual
 * structure.
 *
 * Deliberately does NOT render a phone field. One of the two real forms this
 * was extracted from never collected a phone at all; forcing a phone widget
 * on it would be new UI it never asked for. `createPersonIdentitySchema`
 * still validates `phoneNumber` when a host opts into it — the host renders
 * its own phone input (masked, unmasked, whatever it already has) beside
 * this component.
 *
 * Deliberately uncontrolled by any form library: `values`/`onChange` are
 * plain props, so a host wires them to `react-hook-form`'s `watch`/`setValue`,
 * to local `useState`, or to anything else — this component doesn't take a
 * position on that.
 */
export interface PersonIdentityFieldsProps {
  values: {
    firstName: string;
    lastName: string;
    email: string;
  };
  onChange: (field: "firstName" | "lastName" | "email", value: string) => void;
  errors?: Partial<Record<"firstName" | "lastName" | "email", string>>;
  /** Renders the email field disabled — email is the account identity, immutable once created. */
  emailDisabled?: boolean;
  /** Shown as the email field's helper text while `emailDisabled` is true. */
  emailDisabledHint?: string;
  disabled?: boolean;
  labels?: Partial<{ firstName: string; lastName: string; email: string }>;
}

const DEFAULT_LABELS = { firstName: "First name", lastName: "Last name", email: "Email" };

export function PersonIdentityFields({
  values,
  onChange,
  errors,
  emailDisabled,
  emailDisabledHint,
  disabled,
  labels,
}: PersonIdentityFieldsProps) {
  const t = { ...DEFAULT_LABELS, ...labels };

  return (
    <>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label={t.firstName}
            variant="outlined"
            value={values.firstName}
            onChange={(e) => onChange("firstName", e.target.value)}
            disabled={disabled}
            error={!!errors?.firstName}
            helperText={errors?.firstName || " "}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label={t.lastName}
            variant="outlined"
            value={values.lastName}
            onChange={(e) => onChange("lastName", e.target.value)}
            disabled={disabled}
            error={!!errors?.lastName}
            helperText={errors?.lastName || " "}
          />
        </Grid>
      </Grid>

      <TextField
        fullWidth
        label={t.email}
        variant="outlined"
        value={values.email}
        onChange={(e) => onChange("email", e.target.value)}
        disabled={disabled || emailDisabled}
        error={!!errors?.email}
        helperText={errors?.email || (emailDisabled ? emailDisabledHint : "") || " "}
      />
    </>
  );
}
