import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { PermissionMatrix } from "./PermissionMatrix";
import {
  DEFAULT_ROLES_LABELS,
  PermissionRecord,
  RoleDisplayGroup,
  RoleFormValues,
  RolesLabels,
} from "./types";

export interface RoleFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: RoleFormValues;
  permissions: PermissionRecord[];
  groups: RoleDisplayGroup[];
  onSubmit: (values: RoleFormValues) => void;
  onClose: () => void;
  processing?: boolean;
  error?: string | null;
  /**
   * Save-time transform for the selected key list, applied immediately before
   * `onSubmit` fires — opt in only. A host that stores no separate `:read`
   * key (it ORs across the others at read time) passes nothing and `onSubmit`
   * receives the raw selection unchanged. A host that materializes `:read` at
   * write time passes its own reconciler. This component never picks a
   * strategy — see SEAM 2.
   */
  reconcilePermissions?: (keys: string[], permissions: PermissionRecord[]) => string[];
  /** Whether this host has a signup-default concept at all. Off = no switch renders, no `isDefault` key in the submitted payload. */
  supportsDefaultRole?: boolean;
  labels?: Partial<RolesLabels>;
}

export function RoleFormDialog({
  open,
  mode,
  initialValues,
  permissions,
  groups,
  onSubmit,
  onClose,
  processing,
  error,
  reconcilePermissions,
  supportsDefaultRole = false,
  labels,
}: RoleFormDialogProps) {
  const t = { ...DEFAULT_ROLES_LABELS, ...labels };
  const isEdit = mode === "edit";

  const [name, setName] = useState(initialValues?.name ?? "");
  const [selected, setSelected] = useState<string[]>(initialValues?.permissions ?? []);
  const [isGlobal, setIsGlobal] = useState(initialValues?.isGlobal ?? false);
  const [isDefault, setIsDefault] = useState(initialValues?.isDefault ?? false);
  const prevProcessing = useRef(false);
  const wasOpen = useRef(false);

  // Seed from initialValues only on the OPEN TRANSITION (closed -> open), not
  // on every render. `initialValues` is host-supplied and very likely a fresh
  // object literal on every host render (e.g. `RolesPanel` reconstructing it
  // from `editingRole` on each of its own re-renders while a save is in
  // flight) — depending on its identity here would re-seed mid-edit and wipe
  // the in-progress `prevProcessing` tracking below, breaking close-on-success
  // for the exact save that triggered the re-render in the first place.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setName(initialValues?.name ?? "");
      setSelected(initialValues?.permissions ?? []);
      setIsGlobal(initialValues?.isGlobal ?? false);
      setIsDefault(initialValues?.isDefault ?? false);
      prevProcessing.current = false;
    }
    wasOpen.current = open;
    // Deliberately NOT depending on initialValues — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close-on-success: dispatch-style host actions resolve unconditionally (an
  // internal middleware swallows the request error), so success/failure is
  // read the same way both real hosts read it — watch `processing` transition
  // true -> false, then check whether `error` landed.
  useEffect(() => {
    if (prevProcessing.current && !processing) {
      if (!error) onClose();
    }
    prevProcessing.current = processing ?? false;
  }, [processing, error, onClose]);

  const handleIsGlobalChange = (checked: boolean) => {
    setIsGlobal(checked);
    if (checked) {
      setSelected(permissions.map((p) => p.key));
    } else if (mode === "create") {
      // Create: toggling off clears the selection.
      setSelected([]);
    }
    // Edit: toggling off leaves the current selection untouched.
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const finalPermissions = reconcilePermissions
      ? reconcilePermissions(selected, permissions)
      : selected;
    const values: RoleFormValues = {
      name: name.trim(),
      permissions: finalPermissions,
      isGlobal,
      ...(supportsDefaultRole ? { isDefault } : {}),
    };
    onSubmit(values);
  };

  const title = isEdit ? t.editTitle : t.newRole;
  const submitLabel = isEdit ? t.saveChanges : t.create;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {/* Both real hosts render the inline error only in edit mode — the
              create dialog relies on the host's own page-level Snackbar for
              the same processError, mounted by RolesPanel, not here. */}
          {isEdit && error && <Alert severity="error">{error}</Alert>}

          <TextField
            required
            fullWidth
            label={t.roleName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Tooltip title={t.isGlobalTooltip}>
            <FormControlLabel
              control={<Switch checked={isGlobal} onChange={(e) => handleIsGlobalChange(e.target.checked)} />}
              label={t.isGlobalLabel}
            />
          </Tooltip>
          {t.isGlobalHelperText && (
            <Typography
              variant="caption"
              sx={{ display: "block", mt: -1, ml: 5.5, color: "text.secondary", lineHeight: 1.45 }}
            >
              {t.isGlobalHelperText}
            </Typography>
          )}

          {supportsDefaultRole && (
            <Tooltip title={t.defaultRoleTooltip}>
              <FormControlLabel
                control={<Switch checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />}
                label={t.defaultRoleLabel}
              />
            </Tooltip>
          )}

          <Divider />
          <Typography variant="subtitle2" color="text.secondary">
            {t.permissionsHeading}
          </Typography>

          {isGlobal && t.isGlobalActiveNote && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              {t.isGlobalActiveNote}
            </Alert>
          )}

          {/* Editable even when isGlobal is on — "global" is scope (per SEAM
              5, in whichever sense the host's own labels give it), not WHICH
              actions. Toggling it on pre-selects all as a convenience. */}
          <PermissionMatrix
            permissions={permissions}
            groups={groups}
            selected={selected}
            onChange={setSelected}
            labels={labels}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {t.cancel}
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!name.trim()}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
