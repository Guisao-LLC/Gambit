import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { checkNewPassword, checkPasswordConfirmation } from "@guisao-llc/gambit-account";
import { DEFAULT_LABELS, ProfileClient, ProfileLabels } from "./types";

/**
 * Change your own password.
 *
 * Validates with `checkNewPassword` from `@guisao-llc/gambit-account` — the
 * SAME function the server calls. That is the point of putting the rule in a
 * package rather than in a controller: the message someone reads before
 * submitting is the message they would have got back, so the form cannot
 * disagree with the API about what is acceptable.
 *
 * Client-side validation here is convenience, never enforcement. The server
 * checks again regardless, because anything a browser can be persuaded not to
 * run is not a control.
 */
export interface ChangePasswordCardProps {
  client: Pick<ProfileClient, "changePassword">;
  labels?: Partial<ProfileLabels>;
  /** Called after a successful change, e.g. to show an app-level toast. */
  onChanged?: () => void;
}

export function ChangePasswordCard({ client, labels, onChanged }: ChangePasswordCardProps) {
  const t = { ...DEFAULT_LABELS, ...labels };

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(false);

    const policy = checkNewPassword(next, current);
    if (!policy.ok) return setError(policy.reason ?? null);

    const match = checkPasswordConfirmation(next, confirm);
    if (!match.ok) return setError(t.passwordsDoNotMatch);

    setBusy(true);
    try {
      await client.changePassword({ currentPassword: current, newPassword: next });
      // Cleared on success so a shared machine does not keep the values in the
      // form, and so the button cannot be pressed twice by accident.
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      onChanged?.();
    } catch (err) {
      // The server's message is shown as-is: it is the authority on why this
      // failed, and it deliberately does not distinguish "wrong password" from
      // "no password set".
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {t.password}
        </Typography>

        <Box component="form" onSubmit={submit} noValidate>
          <Stack spacing={2} sx={{ maxWidth: 420 }}>
            <TextField
              label={t.currentPassword}
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              fullWidth
            />
            <TextField
              label={t.newPassword}
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              fullWidth
            />
            <TextField
              label={t.confirmPassword}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              fullWidth
            />

            {error && <Alert severity="error">{error}</Alert>}
            {done && <Alert severity="success">{t.passwordUpdated}</Alert>}

            <Box>
              <Button
                type="submit"
                variant="contained"
                // Disabled only while in flight. NOT disabled on invalid input:
                // a button that cannot be pressed does not say why, and the
                // reason is the useful part.
                disabled={busy}
              >
                {t.updatePassword}
              </Button>
            </Box>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
