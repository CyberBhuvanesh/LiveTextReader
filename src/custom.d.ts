export {};

declare global {
  interface EnvConfig {
    azureApiKey: string;
    azureEndpoint: string;
  }

  interface Window {
    env: EnvConfig;
  }
}
