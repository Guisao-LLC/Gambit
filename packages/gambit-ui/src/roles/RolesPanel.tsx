import { ReactNode, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import PublicIcon from "@mui/icons-material/Public";
import BusinessIcon from "@mui/icons-material/Business";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { RoleFormDialog } from "./RoleFormDialog";
import {
  DEFAULT_ROLES_LABELS,
  PermissionRecord,
  RoleDisplayGroup,
  RoleFormValues,
  RoleRecord,
  RolesLabels,
} from "./types";

export interface RolesPanelProps {
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  groups: RoleDisplayGroup[];
  loading?: boolean;
  listError?: string | null;
  processing?: boolean;
  processError?: string | null;
  onDismissProcessError?: () => void;
  onCreateRole: (values: RoleFormValues) => void;
  onUpdateRole: (role: RoleRecord & RoleFormValues) => void;
  onDeleteRole: (id: string) => void;
  reconcilePermissions?: (keys: string[], permissions: PermissionRecord[]) => string[];
  supportsDefaultRole?: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  viewOnly?: boolean;
  /** Chrome slot — defaults to a plain MUI Card/CardHeader/CardContent when omitted. Both real hosts pass their own theme's MainCard. */
  renderContainer?: (props: { title: ReactNode; action?: ReactNode; children: ReactNode }) => ReactNode;
  /** Row delete affordance slot — defaults to a plain MUI IconButton + window.confirm when omitted. */
  renderDeleteAction?: (role: RoleRecord, onConfirm: () => void) => ReactNode;
  labels?: Partial<RolesLabels>;
}

const defaultRenderContainer: NonNullable<RolesPanelProps["renderContainer"]> = ({ title, action, children }) => (
  <Card variant="outlined">
    <CardHeader title={title} action={action} />
    <CardContent>{children}</CardContent>
  </Card>
);

const defaultRenderDeleteAction: NonNullable<RolesPanelProps["renderDeleteAction"]> = (role, onConfirm) => (
  <Tooltip title="Delete">
    <IconButton
      size="small"
      color="error"
      onClick={() => {
        // eslint-disable-next-line no-alert
        if (window.confirm("This action cannot be undone.")) onConfirm();
      }}
    >
      <DeleteIcon fontSize="small" />
    </IconButton>
  </Tooltip>
);

export function RolesPanel({
  roles,
  permissions,
  groups,
  loading,
  listError,
  processing,
  processError,
  onDismissProcessError,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  reconcilePermissions,
  supportsDefaultRole = false,
  canCreate,
  canEdit,
  canDelete,
  viewOnly,
  renderContainer = defaultRenderContainer,
  renderDeleteAction = defaultRenderDeleteAction,
  labels,
}: RolesPanelProps) {
  const t = { ...DEFAULT_ROLES_LABELS, ...labels };
  const [addOpen, setAddOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);

  if (loading) return null;
  if (listError) return <Alert severity="error">{listError}</Alert>;

  const container = renderContainer({
    title: t.title,
    action: canCreate ? (
      <Button
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        onClick={() => setAddOpen(true)}
        sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }}
      >
        {t.newRole}
      </Button>
    ) : undefined,
    children: (
      <Stack spacing={2}>
        {viewOnly && <Alert severity="info">{t.readOnlyMessage}</Alert>}
        {roles.map((r) => {
          const permLabels = (r.permissions ?? []).map(
            (key) => permissions.find((p) => p.key === key)?.label ?? key,
          );

          return (
            <Paper
              key={r._id}
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                p: 2.5,
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: 3 },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>
                      {r.name}
                    </Typography>
                    <Tooltip title={t.isGlobalTooltip}>
                      <Chip
                        icon={r.isGlobal ? <PublicIcon sx={{ fontSize: 14 }} /> : <BusinessIcon sx={{ fontSize: 14 }} />}
                        label={r.isGlobal ? t.scopeGlobal : t.scopeNonGlobal}
                        size="small"
                        color={r.isGlobal ? "primary" : "default"}
                        variant="outlined"
                        sx={{ height: 22, fontSize: "0.7rem" }}
                      />
                    </Tooltip>
                  </Box>

                  {permLabels.length > 0 ? (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {permLabels.map((label) => (
                        <Chip key={label} label={label} size="small" variant="outlined" sx={{ fontSize: "0.72rem" }} />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.disabled">
                      {t.noPermissions}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 28, alignSelf: "center" }} />
                  {canEdit && (
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => setEditingRole(r)} sx={{ color: "primary.main" }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canDelete && renderDeleteAction(r, () => onDeleteRole(r._id))}
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Stack>
    ),
  });

  return (
    <>
      {processError && (
        <Snackbar
          open={Boolean(processError)}
          autoHideDuration={6000}
          onClose={onDismissProcessError}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert onClose={onDismissProcessError} severity="error" sx={{ width: "100%" }}>
            {processError}
          </Alert>
        </Snackbar>
      )}

      <RoleFormDialog
        open={addOpen}
        mode="create"
        permissions={permissions}
        groups={groups}
        onSubmit={(values) => onCreateRole(values)}
        onClose={() => setAddOpen(false)}
        processing={processing}
        error={processError}
        reconcilePermissions={reconcilePermissions}
        supportsDefaultRole={supportsDefaultRole}
        labels={labels}
      />

      {editingRole && (
        <RoleFormDialog
          open
          mode="edit"
          initialValues={{
            name: editingRole.name,
            permissions: editingRole.permissions ?? [],
            isGlobal: editingRole.isGlobal ?? false,
            isDefault: editingRole.isDefault ?? false,
          }}
          permissions={permissions}
          groups={groups}
          onSubmit={(values) => onUpdateRole({ ...editingRole, ...values })}
          onClose={() => setEditingRole(null)}
          processing={processing}
          error={processError}
          reconcilePermissions={reconcilePermissions}
          supportsDefaultRole={supportsDefaultRole}
          labels={labels}
        />
      )}

      {container}
    </>
  );
}
