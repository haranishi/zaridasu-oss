/** Build configuration and trusted deployment bindings select this, never request headers. */
export function deploymentEnvironment(): string {
  return process.env.NEXT_PUBLIC_DEPLOYMENT_ENV
    ?? process.env.ZARIDASU_DEPLOYMENT_ENV
    ?? process.env.VERCEL_ENV
    ?? process.env.NODE_ENV
    ?? 'development'
}

export function isProductionDeployment(): boolean {
  return deploymentEnvironment() === 'production'
}
