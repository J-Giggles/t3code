import { normalizePublicPathPrefix } from "@t3tools/shared/publicPath";

export interface DevProxyRoute {
  readonly path: string;
  readonly websocket: boolean;
}

const BASE_DEV_PROXY_ROUTES: readonly DevProxyRoute[] = [
  { path: "/.well-known", websocket: false },
  { path: "/api", websocket: false },
  { path: "/attachments", websocket: false },
  { path: "/ws", websocket: true },
];

export function resolveDevProxyRoutes(
  publicPathPrefix: string | undefined,
): readonly DevProxyRoute[] {
  const normalizedPrefix = normalizePublicPathPrefix(publicPathPrefix);
  if (!normalizedPrefix) {
    return BASE_DEV_PROXY_ROUTES;
  }

  return [
    ...BASE_DEV_PROXY_ROUTES,
    ...BASE_DEV_PROXY_ROUTES.map((route) => ({
      ...route,
      path: `${normalizedPrefix}${route.path}`,
    })),
  ];
}
