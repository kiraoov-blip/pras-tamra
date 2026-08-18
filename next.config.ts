import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isAccountPage = repositoryName.endsWith(".github.io");
const repositoryBasePath =
  isGitHubPages && repositoryName && !isAccountPage ? `/${repositoryName}` : "";

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: "export",
      trailingSlash: true,
      basePath: repositoryBasePath,
      assetPrefix: repositoryBasePath || undefined,
      images: { unoptimized: true },
      // The shared repository also contains Cloudflare Worker-only source.
      // GitHub Pages application types are checked separately before this build.
      typescript: { ignoreBuildErrors: true },
    }
  : {};

export default nextConfig;
