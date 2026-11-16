import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["magon-pay-react"],
  // libsodium (cifrado de secretos de GitHub) no se deja empaquetar: Node lo carga directo.
  serverExternalPackages: ["libsodium-wrappers"],
};

export default nextConfig;
