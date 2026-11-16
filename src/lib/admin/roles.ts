// Roles del panel y qué puede hacer cada uno. Sin dependencias: lo usan el servidor y el panel.

export type Role = "admin" | "dev" | "soporte";

export type Permission =
  // Plata: resumen, cobros, costos, facturas y montos de los clientes.
  | "finance"
  // Alta y edición de clientes y de usuarios del panel.
  | "manage"
  // Bóveda de credenciales.
  | "vault"
  // Agente de Claude en GitHub (issues, ramas, PRs).
  | "agent"
  // Ver y corregir las horas de todo el equipo (cada uno siempre ve las suyas).
  | "time.all";

export const ROLES: Array<{ value: Role; label: string; description: string }> = [
  { value: "admin", label: "Administrador", description: "Todo: plata, clientes, usuarios, bóveda y horas del equipo." },
  { value: "dev", label: "Desarrollo", description: "Tablero, documentación, bóveda y agente de GitHub. Sin plata." },
  { value: "soporte", label: "Soporte", description: "Tablero y documentación. Sin plata, bóveda ni agente." },
];

const PERMISSIONS: Record<Role, Permission[]> = {
  admin: ["finance", "manage", "vault", "agent", "time.all"],
  dev: ["vault", "agent"],
  soporte: [],
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "dev" || value === "soporte";
}

export function permissionsFor(role: Role): Permission[] {
  return PERMISSIONS[role];
}

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

export function roleLabel(role: Role): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}
