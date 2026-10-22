/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The game runs entirely in the browser, so the site is exported as plain static files (web/out).
  output: "export",
  images: { unoptimized: true },
};
export default nextConfig;
