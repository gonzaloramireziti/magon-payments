// Datos fijos del aviso de cobro mensual. El alias se puede cambiar con BILLING_ALIAS.
export const NOTICE_ISSUER = {
  brand: "MAGONSOFTWARE",
  payTo: "MagonSoftware",
  alias: process.env.BILLING_ALIAS ?? "magon.mp",
};

// Un solo concepto para todos los clientes.
export const NOTICE_CONCEPT = "Servicio de software";
export const NOTICE_DETAIL = "Servidor, base de datos, copias de seguridad y mantenimiento";

// Emisor de la factura mensual (formato Magon Software LLC).
export const INVOICE_ISSUER = {
  name: "Magon Software LLC",
  addressLines: ["30 N Gould St", "Ste N", "Sheridan, Wyoming 82801", "Estados Unidos"],
  phone: "+54 9 2317 57-2350",
};

// Tipos de servicio facturables. Por ahora solo el cobro recurrente mensual.
export const SERVICE_TYPES = { recurring: "Cobro recurrente" } as const;
export type ServiceType = keyof typeof SERVICE_TYPES;

export function isServiceType(value: unknown): value is ServiceType {
  return typeof value === "string" && value in SERVICE_TYPES;
}

// Concepto de la factura cuando el cliente no tiene descripción de servicio cargada.
export const DEFAULT_SERVICE_DESCRIPTION =
  "Servicio mensual de software: servidor, base de datos, copias de seguridad y mantenimiento.";
