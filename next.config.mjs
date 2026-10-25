import { withSentryConfig } from '@sentry/nextjs/config';
/** @type {import('next').NextConfig} */
const nextConfig = {
  // RFC 9728 fixes where an MCP client looks for the protected-resource
  // metadata: under /.well-known, with the resource's path appended
  // (/.well-known/oauth-protected-resource/api/mcp), or bare for older
  // clients. The handler lives in app/api/ with the other server code — the
  // lib/ boundary treats everything else under app/ as browser code — and this
  // maps both URLs onto it.
  async rewrites() {
    return [{ source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/mcp/metadata" }];
  },
};
export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "igor-69ffa730",
  project: "luku-app",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring"

});
