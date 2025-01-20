module.exports = {
  apps: [
    {
      name: "gemini-extraction",
      script: "dist/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
        PORT: 8080,
        HOST: "0.0.0.0", // Pour écouter sur toutes les interfaces réseau
      },
    },
  ],
};
