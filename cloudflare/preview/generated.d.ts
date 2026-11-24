// Only the isolated profile materializes this private, server-only build module.
declare module '*/.wrangler/preview-profile/revalidation-token.mjs' {
  export const revalidationToken: string
}
