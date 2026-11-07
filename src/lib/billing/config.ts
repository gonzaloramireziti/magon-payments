// Datos fijos del aviso de cobro mensual. El alias se puede cambiar con BILLING_ALIAS.
export const NOTICE_ISSUER = {
  brand: "MAGONSOFTWARE",
  payTo: "MagonSoftware",
  alias: process.env.BILLING_ALIAS ?? "magon.mp",
};

// Un solo concepto para todos los clientes.
export const NOTICE_CONCEPT = "Servicio de software";
export const NOTICE_DETAIL = "Servidor, base de datos, copias de seguridad y mantenimiento";
