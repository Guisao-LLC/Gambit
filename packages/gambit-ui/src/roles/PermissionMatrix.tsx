import {
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { DEFAULT_ROLES_LABELS, PermissionRecord, RoleDisplayGroup, RolesLabels } from "./types";

// 3-column matrix per the "pages always render" agreement both hosts this was
// extracted from share. View column dropped: page visibility + nav gating are
// derived from holding any of Add / Edit / Delete. `:read` keys still exist in
// the catalog (a host's own access checks may still authorize on them), but
// admins no longer manage them through this matrix — see `RoleFormDialog`'s
// `reconcilePermissions` seam for how a host keeps its own `:read` keys honest
// at save time, if it needs to at all.
const ACTIONS = ["add", "write", "delete"] as const;

export interface PermissionMatrixProps {
  permissions: PermissionRecord[];
  groups: RoleDisplayGroup[];
  selected: string[];
  onChange: (keys: string[]) => void;
  readOnly?: boolean;
  labels?: Partial<RolesLabels>;
}

export function PermissionMatrix({
  permissions,
  groups,
  selected,
  onChange,
  readOnly = false,
  labels,
}: PermissionMatrixProps) {
  const t = { ...DEFAULT_ROLES_LABELS, ...labels };
  const columns = [
    { action: "add", label: t.addColumn },
    { action: "write", label: t.editColumn },
    { action: "delete", label: t.deleteColumn },
  ] as const;

  const keysFor = (members: string[], action: string): string[] =>
    permissions
      .filter((p) => members.includes(p.group) && (p.action === action || p.key.endsWith(`:${action}`)))
      .map((p) => p.key);

  const toggleGroup = (keys: string[]) => {
    const allChecked = keys.every((k) => selected.includes(k));
    const someChecked = keys.some((k) => selected.includes(k));
    // Three-state click semantics:
    //   - all checked   → remove all (turn off)
    //   - indeterminate → remove all (treat partial as "wanted off")
    //   - all unchecked → add all (turn on)
    // Treating indeterminate as "clear" matches user intent — the dash reads
    // as "kind of off, please finish turning it off".
    if (allChecked || someChecked) {
      onChange(selected.filter((k) => !keys.includes(k)));
    } else {
      onChange([...selected, ...keys]);
    }
  };

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>
            <Typography variant="subtitle2">{t.featureColumn}</Typography>
          </TableCell>
          {columns.map(({ action, label }) => (
            <TableCell key={action} align="center">
              <Typography variant="subtitle2">{label}</Typography>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {groups.map((g) => {
          const perAction = ACTIONS.map((action) => ({
            action,
            keys: keysFor(g.members, action),
          }));
          // Skip the row entirely when every column is empty. This is the
          // mechanism that lets a host's row list safely LEAD its own catalog
          // — rows render only when the DB actually holds matching permissions.
          if (perAction.every((c) => c.keys.length === 0)) return null;
          return (
            <TableRow key={g.label} hover>
              <TableCell>{g.label}</TableCell>
              {perAction.map(({ action, keys }) => {
                if (keys.length === 0) {
                  return (
                    <TableCell key={action} align="center" padding="checkbox">
                      <Typography variant="caption" color="text.disabled">
                        —
                      </Typography>
                    </TableCell>
                  );
                }
                const allChecked = keys.every((k) => selected.includes(k));
                const someChecked = keys.some((k) => selected.includes(k));
                return (
                  <TableCell key={action} align="center" padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={allChecked}
                      indeterminate={!allChecked && someChecked}
                      onChange={() => !readOnly && toggleGroup(keys)}
                      disabled={readOnly}
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
