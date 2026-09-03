import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { checkAvatarUpload } from "@guisao-llc/gambit-account";
import { DEFAULT_LABELS, Profile, ProfileClient, ProfileLabels } from "./types";

/**
 * Your name, phone and picture.
 *
 * Email and role are shown but never editable: changing either is an
 * administrative act, and a form that appears to offer it is worse than one
 * that does not.
 *
 * The avatar is validated with `checkAvatarUpload` from
 * `@guisao-llc/gambit-account` — the same function the server uses — so a file
 * that will be refused is refused before it is uploaded, with the same reason.
 * The server still checks: this saves a round trip, it does not replace a
 * control.
 */
export interface ProfileDetailsCardProps {
  client: ProfileClient;
  labels?: Partial<ProfileLabels>;
  /** Called whenever the profile changes, e.g. to refresh an app-level header. */
  onChange?: (profile: Profile) => void;
}

/** Rebuild a displayable URL. Stored without the prefix — see the server. */
const toSrc = (avatar: Profile["avatar"]) =>
  avatar ? `data:${avatar.mime};base64,${avatar.base64}` : undefined;

export function ProfileDetailsCard({ client, labels, onChange }: ProfileDetailsCardProps) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const fileInput = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .load()
      .then((p) => {
        // Guard against a resolve after unmount — otherwise a slow request on a
        // page the user has left sets state on a dead component.
        if (cancelled) return;
        setProfile(p);
        setName(p.name ?? "");
        setPhone(p.phoneNumber ?? "");
      })
      .catch(() => !cancelled && setLoadError(t.loadFailed));
    return () => {
      cancelled = true;
    };
    // Intentionally once: this card owns the initial load, and re-running on
    // every `client` identity change would refetch on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (p: Profile) => {
    setProfile(p);
    onChange?.(p);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (name.trim().length < 2) return setError(t.nameTooShort);

    setBusy(true);
    try {
      apply(await client.save({ name: name.trim(), phoneNumber: phone.trim() }));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately, so choosing the same file twice fires onChange again.
    event.target.value = "";
    if (!file) return;

    setError(null);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    // The same check the server runs — SVG refused, size capped — so an image
    // that would be rejected never leaves the browser.
    const check = checkAvatarUpload({ mime: file.type, base64 });
    if (!check.ok) return setError(check.reason ?? null);

    setBusy(true);
    try {
      const avatar = await client.uploadAvatar({ base64, mime: file.type });
      if (profile) apply({ ...profile, avatar });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const clearAvatar = async () => {
    setBusy(true);
    try {
      await client.removeAvatar();
      if (profile) apply({ ...profile, avatar: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Alert severity="error">{loadError}</Alert>;
  if (!profile) return <Typography>{t.loading}</Typography>;

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {t.details}
        </Typography>

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Avatar src={toSrc(profile.avatar)} sx={{ width: 72, height: 72 }}>
            {profile.name?.[0]?.toUpperCase()}
          </Avatar>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => fileInput.current?.click()} disabled={busy}>
              {t.changePhoto}
            </Button>
            {profile.avatar && (
              <Button size="small" color="error" onClick={clearAvatar} disabled={busy}>
                {t.removePhoto}
              </Button>
            )}
          </Stack>
          <input
            ref={fileInput}
            type="file"
            hidden
            // Advisory only — the check above is what actually decides, since a
            // file picker's accept list is trivially bypassed.
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={pickAvatar}
            data-testid="avatar-input"
          />
        </Stack>

        <Box component="form" onSubmit={save} noValidate>
          <Stack spacing={2} sx={{ maxWidth: 420 }}>
            <TextField
              label={t.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />
            <TextField
              label={t.phone}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />
            {/* Shown for context, never editable — see the note at the top. */}
            <TextField label={t.email} value={profile.email} disabled fullWidth />
            {profile.roles !== undefined && (
              <TextField label={t.role} value={profile.roles} disabled fullWidth />
            )}

            {error && <Alert severity="error">{error}</Alert>}
            {saved && <Alert severity="success">{t.saved}</Alert>}

            <Box>
              <Button type="submit" variant="contained" disabled={busy}>
                {t.save}
              </Button>
            </Box>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}
