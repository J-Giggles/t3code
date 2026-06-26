interface PreviewUrlPresentationInput {
  readonly url: string;
  readonly environmentLabel: string;
  readonly environmentHttpBaseUrl: string;
}

function assetRoutePath(environmentUrl: URL): string {
  const basePath = environmentUrl.pathname.endsWith("/")
    ? environmentUrl.pathname.slice(0, -1)
    : environmentUrl.pathname;
  return `${basePath}/api/assets/`;
}

export function formatPreviewUrl(input: PreviewUrlPresentationInput): string | null {
  try {
    const url = new URL(input.url);
    const environmentUrl = new URL(input.environmentHttpBaseUrl);
    if (
      url.origin === environmentUrl.origin &&
      url.pathname.startsWith(assetRoutePath(environmentUrl))
    ) {
      const encodedFileName = url.pathname.split("/").at(-1);
      if (!encodedFileName) {
        return null;
      }
      const fileName = decodeURIComponent(encodedFileName);
      if (!fileName || fileName === "." || fileName === "..") {
        return null;
      }
      return `${input.environmentLabel} · ${fileName}`;
    }

    return url.protocol === "http:" || url.protocol === "https:" ? url.host : null;
  } catch {
    return null;
  }
}
